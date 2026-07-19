"""Build-time model prefetch for the standalone desktop build.

Downloads the faster-whisper `tiny` and `base` snapshots and compacts them
into packaging/models_staging/bundled/ in a form the PyInstaller build can
embed directly. The runtime counterpart that seeds this into a fresh
HF_HUB_CACHE on first launch lives in backend/app/desktop.py.

Must run somewhere real filesystem symlinks work (Linux/macOS, or Windows
with Developer Mode) — huggingface_hub's cache uses symlinks from
snapshots/<commit>/<file> to blobs/<hash>, and the compaction step below
relies on resolving those to get each blob's real hash-named file.
"""

import json
import shutil
import sys
from pathlib import Path

from faster_whisper.utils import _MODELS as FASTER_WHISPER_REPOS
from huggingface_hub import snapshot_download

REPO_ROOT = Path(__file__).resolve().parent.parent
STAGING_DIR = REPO_ROOT / "packaging" / "models_staging"
RAW_CACHE_DIR = STAGING_DIR / "raw"
BUNDLE_DIR = STAGING_DIR / "bundled"

MODEL_SIZES = ["tiny", "base"]
ALLOW_PATTERNS = [
    "config.json",
    "preprocessor_config.json",
    "model.bin",
    "tokenizer.json",
    "vocabulary.*",
]


def _download(model_size: str) -> tuple[str, Path]:
    repo_id = FASTER_WHISPER_REPOS[model_size]
    snapshot_dir = snapshot_download(
        repo_id, cache_dir=RAW_CACHE_DIR, allow_patterns=ALLOW_PATTERNS
    )
    return repo_id, Path(snapshot_dir)


def _compact(repo_id: str, snapshot_dir: Path) -> Path:
    repo_bundle_dir = BUNDLE_DIR / repo_id.replace("/", "--")
    blobs_dir = repo_bundle_dir / "blobs"
    blobs_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, str] = {}
    for entry in sorted(snapshot_dir.iterdir()):
        if not entry.is_symlink():
            raise RuntimeError(
                f"{entry} is a plain file, not a symlink into the blob store. "
                "This script must run where real symlinks work (Linux/macOS, "
                "or Windows with Developer Mode enabled) — huggingface_hub "
                "silently falls back to plain copies otherwise, which breaks "
                "the blob-hash-based compaction below."
            )
        blob_hash = entry.resolve().name
        dest = blobs_dir / blob_hash
        if not dest.exists():
            shutil.copy2(entry.resolve(), dest)
        manifest[entry.name] = blob_hash

    commit_sha = snapshot_dir.name  # snapshot dirs are named after the resolved commit
    (repo_bundle_dir / "refs").mkdir(exist_ok=True)
    (repo_bundle_dir / "refs" / "main").write_text(commit_sha)
    (repo_bundle_dir / "manifest.json").write_text(
        json.dumps({"repo_id": repo_id, "commit": commit_sha, "files": manifest}, indent=2)
    )

    total_mb = sum(f.stat().st_size for f in blobs_dir.iterdir()) / (1024 * 1024)
    print(f"  {repo_id}: {len(manifest)} files, {total_mb:.1f} MB -> {repo_bundle_dir.relative_to(REPO_ROOT)}")
    return repo_bundle_dir


def main() -> None:
    if BUNDLE_DIR.exists():
        shutil.rmtree(BUNDLE_DIR)

    for size in MODEL_SIZES:
        print(f"Fetching {size}...")
        repo_id, snapshot_dir = _download(size)
        _compact(repo_id, snapshot_dir)

    print(f"Done. Bundled models staged at {BUNDLE_DIR.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
