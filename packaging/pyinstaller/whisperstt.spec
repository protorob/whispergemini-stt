# PyInstaller spec for the standalone desktop build (see PLAN in
# backend/app/desktop.py and README's "Standalone desktop app" section).
#
# Build from the repo root:
#   pyinstaller packaging/pyinstaller/whisperstt.spec
#
# On Windows this must run natively (not from WSL) — PyInstaller can't
# cross-build a Windows executable from Linux. `scripts/prefetch_models.py`
# must have already been run once to populate packaging/models_staging/bundled/.

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

block_cipher = None

REPO_ROOT = Path(SPECPATH).resolve().parent.parent
BUNDLED_MODELS_DIR = REPO_ROOT / "packaging" / "models_staging" / "bundled"
FRONTEND_DIR = REPO_ROOT / "frontend"
WEBVIEW2_INSTALLER = REPO_ROOT / "packaging" / "webview2" / "MicrosoftEdgeWebview2Setup_standalone.exe"
ICON_PATH = REPO_ROOT / "packaging" / "app.ico"

if not BUNDLED_MODELS_DIR.exists():
    raise SystemExit(
        "packaging/models_staging/bundled/ is missing — run "
        "`python scripts/prefetch_models.py` first."
    )

datas = [
    (str(FRONTEND_DIR), "frontend"),
    (str(BUNDLED_MODELS_DIR), "bundled_models"),
]
binaries = []
hiddenimports = [
    # uvicorn's loop/protocol/lifespan selection is dynamic (importlib-based)
    # and invisible to PyInstaller's static import analysis.
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "uvicorn.logging",
]

# Native/data-bearing packages PyInstaller's static analysis tends to miss
# pieces of — see PLAN §1 for why each of these is here.
for package in (
    "ctranslate2",
    "tokenizers",
    "av",
    "huggingface_hub",
    "certifi",
    "google.genai",
    "pypandoc",
    "imageio_ffmpeg",
    "uvicorn",
    "pydantic",
    "webview",
):
    pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(package)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hiddenimports

if sys.platform == "win32" and WEBVIEW2_INSTALLER.exists():
    datas.append((str(WEBVIEW2_INSTALLER), "."))
elif sys.platform == "win32":
    print(
        "WARNING: packaging/webview2/MicrosoftEdgeWebview2Setup_standalone.exe "
        "not found — the built app will have no offline fallback if the "
        "target machine is missing the WebView2 runtime. Download the "
        "'Evergreen Standalone Installer' from Microsoft's WebView2 page and "
        "place it there before building for a fully offline-capable app."
    )

a = Analysis(
    ["../../backend/app/desktop.py"],
    pathex=[str(REPO_ROOT / "backend")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="whisperstt",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # keep a visible console in v1 (see PLAN §3) so a user can see/quit the server
    icon=str(ICON_PATH) if ICON_PATH.exists() else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="whisperstt",
)
