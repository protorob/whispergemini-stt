"""PyInstaller entrypoint for the standalone desktop build.

This — not app.main — is what the frozen .exe actually runs. It sets
HF_HUB_CACHE to a portable, writable folder next to the executable *before*
anything imports huggingface_hub (directly, or transitively via
app.model_status / faster_whisper / app.config), seeds the bundled tiny/base
models into that folder, then starts the FastAPI app (uvicorn) in a
background thread and shows it in a pywebview window.

The portable data folder (next to the exe, not the Windows user profile)
is what lets the whole thing — app, bundled model, anything downloaded
later — travel on a USB drive between machines without depending on any
one PC's user account. See packaging/pyinstaller/whisperstt.spec for how
this gets bundled, and scripts/prefetch_models.py for how
packaging/models_staging/bundled/ (aka bundled_models/ once frozen) gets
built in the first place.
"""

import json
import os
import shutil
import socket
import sys
import threading
from pathlib import Path


def _app_dir() -> Path:
    """Directory the executable itself lives in — stable regardless of
    which drive letter this happens to be running from (unlike a fixed
    absolute path), so the same build works when moved between PCs.
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    # Not frozen: only reached when running this file directly for local
    # testing, not the normal `uvicorn app.main:app` dev workflow.
    return Path(__file__).resolve().parent.parent.parent


def _bundled_models_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "bundled_models"
    return _app_dir() / "packaging" / "models_staging" / "bundled"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def seed_bundled_models(hf_cache: Path) -> None:
    """Copy each pre-fetched model from _bundled_models_dir() into hf_cache,
    reconstructing the blobs/refs/snapshots layout huggingface_hub expects,
    so model_status.is_ready() reports "ready" with no further downloads.

    Safe to call on every launch — skips any repo that's already seeded.
    Must run after HF_HUB_CACHE is set in the environment (model_status
    reads it, indirectly, at import time).
    """
    from app.model_status import is_ready

    bundled_dir = _bundled_models_dir()
    if not bundled_dir.exists():
        return

    for repo_dir in sorted(bundled_dir.iterdir()):
        manifest_path = repo_dir / "manifest.json"
        if not manifest_path.exists():
            continue
        manifest = json.loads(manifest_path.read_text())
        repo_id = manifest["repo_id"]

        if is_ready(repo_id):
            continue

        target_dir = hf_cache / ("models--" + repo_id.replace("/", "--"))
        target_blobs = target_dir / "blobs"
        target_snapshot = target_dir / "snapshots" / manifest["commit"]
        target_blobs.mkdir(parents=True, exist_ok=True)
        target_snapshot.mkdir(parents=True, exist_ok=True)
        (target_dir / "refs").mkdir(parents=True, exist_ok=True)
        (target_dir / "refs" / "main").write_text(manifest["commit"])

        for filename, blob_hash in manifest["files"].items():
            src_blob = repo_dir / "blobs" / blob_hash
            dest_blob = target_blobs / blob_hash
            if not dest_blob.exists():
                shutil.copy2(src_blob, dest_blob)

            dest_link = target_snapshot / filename
            if dest_link.exists() or dest_link.is_symlink():
                continue
            try:
                os.symlink(dest_blob, dest_link)
            except OSError:
                # Windows without Developer Mode can't create symlinks —
                # huggingface_hub itself falls back to plain copies in the
                # same situation, so this mirrors its own behavior.
                shutil.copy2(dest_blob, dest_link)


def _webview2_installer_path() -> Path | None:
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return None
    installer = Path(sys._MEIPASS) / "MicrosoftEdgeWebview2Setup_standalone.exe"
    return installer if installer.exists() else None


def _show_window(url: str, storage_dir: Path) -> None:
    import webview

    webview.create_window("Whisper STT", url, width=1100, height=800)

    # pywebview defaults to private_mode=True (no persisted cookies/local
    # storage at all), which would silently reset the Gemini key, HF token,
    # and mic device choice — all stored via the frontend's localStorage —
    # on every relaunch. storage_dir keeps that persisted state inside the
    # same portable data/ folder as the model cache, so it travels with the
    # app rather than living in some fixed spot on whichever PC ran it.
    start_kwargs = {"private_mode": False, "storage_path": str(storage_dir)}
    try:
        webview.start(**start_kwargs)
        return
    except Exception:
        pass

    installer = _webview2_installer_path()
    if installer is None:
        raise RuntimeError(
            "pywebview failed to start and no bundled WebView2 runtime "
            "installer is available to fall back to."
        )

    import subprocess

    subprocess.run([str(installer), "/silent", "/install"], check=True)
    webview.start(**start_kwargs)


def main() -> None:
    app_dir = _app_dir()
    data_dir = app_dir / "data"
    hf_cache = data_dir / "hf-cache" / "hub"
    hf_cache.mkdir(parents=True, exist_ok=True)

    # Must happen before anything below (transitively) imports huggingface_hub.
    os.environ["HF_HUB_CACHE"] = str(hf_cache)

    if not getattr(sys, "frozen", False):
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    seed_bundled_models(hf_cache)

    import uvicorn

    from app.main import app  # safe only now that HF_HUB_CACHE is set

    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    )
    threading.Thread(target=server.run, daemon=True).start()

    webview_storage_dir = data_dir / "webview-storage"
    webview_storage_dir.mkdir(parents=True, exist_ok=True)

    try:
        _show_window(f"http://127.0.0.1:{port}", webview_storage_dir)
    finally:
        server.should_exit = True


if __name__ == "__main__":
    main()
