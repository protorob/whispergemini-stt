import threading
import time
from dataclasses import dataclass
from pathlib import Path

from faster_whisper.utils import _MODELS as FASTER_WHISPER_REPOS
from huggingface_hub import HfApi
from huggingface_hub.constants import HF_HUB_CACHE

_ALLOWED_FILES = {"config.json", "preprocessor_config.json", "model.bin", "tokenizer.json"}
_ALLOWED_PREFIXES = ("vocabulary.",)

# Files every faster-whisper repo ships, used by is_ready() below. Unlike
# _ALLOWED_FILES (used for download-size bookkeeping), this must NOT include
# preprocessor_config.json: that file only exists in some repos (e.g.
# large-v3), not tiny/base/small/medium, so requiring it unconditionally
# would make is_ready() report "not ready" forever for those sizes even
# after a complete download.
_REQUIRED_FILES = {"config.json", "model.bin", "tokenizer.json"}

_total_bytes_cache: dict[str, int | None] = {}
_total_bytes_lock = threading.Lock()

_warming: set[str] = set()
_errors: dict[str, str] = {}
_warming_lock = threading.Lock()


def repo_id_for(model_size: str) -> str:
    return FASTER_WHISPER_REPOS[model_size]


def _repo_cache_dir(repo_id: str) -> Path:
    return Path(HF_HUB_CACHE) / ("models--" + repo_id.replace("/", "--"))


def _is_wanted_file(filename: str) -> bool:
    return filename in _ALLOWED_FILES or filename.startswith(_ALLOWED_PREFIXES)


def _downloaded_bytes(repo_id: str) -> int:
    blobs_dir = _repo_cache_dir(repo_id) / "blobs"
    if not blobs_dir.exists():
        return 0
    total = 0
    for entry in blobs_dir.iterdir():
        try:
            total += entry.stat().st_size
        except OSError:
            continue
    return total


def _total_bytes(repo_id: str) -> int | None:
    """Expected total download size, fetched once from the Hub API and cached.

    Returns None if the metadata call fails (e.g. offline) — callers should
    fall back to an indeterminate progress display in that case.
    """
    with _total_bytes_lock:
        if repo_id in _total_bytes_cache:
            return _total_bytes_cache[repo_id]

    total: int | None
    try:
        info = HfApi().model_info(repo_id, files_metadata=True)
        total = sum(s.size or 0 for s in info.siblings if _is_wanted_file(s.rfilename))
    except Exception:
        total = None

    with _total_bytes_lock:
        _total_bytes_cache[repo_id] = total
    return total


def is_ready(repo_id: str) -> bool:
    """A model is "ready" once every required file exists in a snapshot dir.

    HF downloads into blobs/<hash>.<rand>.incomplete and only renames to the
    final blobs/<hash> (which snapshots/*/file symlinks or copies point to)
    once the transfer completes — so a resolving snapshot entry is a
    reliable "fully downloaded" signal for each individual file.

    Files download in parallel, and small ones (config.json, tokenizer.json,
    vocabulary.*) land in seconds while model.bin (multi-GB) is still
    transferring. Building the "wanted" set from whatever's *currently* in
    the snapshot directory — rather than the fixed set of files a model
    actually needs — would report "ready" the moment those small files
    exist, even though model.bin hasn't shown up at all yet. So we check
    presence of every required filename explicitly instead.
    """
    snapshots_dir = _repo_cache_dir(repo_id) / "snapshots"
    if not snapshots_dir.exists():
        return False
    for snap in snapshots_dir.iterdir():
        if not snap.is_dir():
            continue
        if not all((snap / name).exists() for name in _REQUIRED_FILES):
            continue
        if not any(f.name.startswith(_ALLOWED_PREFIXES) for f in snap.iterdir()):
            continue
        return True
    return False


def status_for(model_size: str) -> dict:
    repo_id = repo_id_for(model_size)

    if is_ready(repo_id):
        return {"status": "ready", "downloaded_mb": None, "total_mb": None, "percent": 100}

    downloaded = _downloaded_bytes(repo_id)
    total = _total_bytes(repo_id)
    with _warming_lock:
        active = repo_id in _warming
        error = _errors.get(repo_id)

    if error and not active:
        # The warm-up thread raised — surface the real reason (e.g. a
        # Windows symlink-privilege error) instead of leaving the frontend
        # to poll "not_started"/"downloading" forever with no explanation.
        return {
            "status": "error",
            "message": error,
            "downloaded_mb": _mb(downloaded),
            "total_mb": _mb(total),
            "percent": None,
        }

    if downloaded == 0 and not active:
        return {"status": "not_started", "downloaded_mb": 0, "total_mb": _mb(total), "percent": None}

    if downloaded > 0 and not active:
        # Partial blobs on disk but no warm-up thread running — a previous
        # download was interrupted.  HF will resume from this offset on the
        # next warm-up attempt, so we surface this as a distinct state rather
        # than a frozen "downloading" indicator.
        percent = min(99, round(downloaded / total * 100)) if total else None
        return {
            "status": "interrupted",
            "downloaded_mb": _mb(downloaded),
            "total_mb": _mb(total),
            "percent": percent,
        }

    percent = min(99, round(downloaded / total * 100)) if total else None
    return {
        "status": "downloading",
        "downloaded_mb": _mb(downloaded),
        "total_mb": _mb(total),
        "percent": percent,
    }


def _mb(n: int | None) -> float | None:
    return round(n / (1024 * 1024), 1) if n is not None else None


def warm_up(model_size: str, load_fn) -> None:
    """Kick off `load_fn()` (which triggers download + load) in the
    background, unless a warm-up for this model is already in flight.
    """
    repo_id = repo_id_for(model_size)
    with _warming_lock:
        if repo_id in _warming or is_ready(repo_id):
            return
        _warming.add(repo_id)
        _errors.pop(repo_id, None)

    def _run():
        try:
            load_fn()
        except Exception as exc:
            with _warming_lock:
                _errors[repo_id] = str(exc) or exc.__class__.__name__
            raise
        finally:
            with _warming_lock:
                _warming.discard(repo_id)

    threading.Thread(target=_run, daemon=True).start()
    time.sleep(0.05)  # let the thread actually start before the caller polls
