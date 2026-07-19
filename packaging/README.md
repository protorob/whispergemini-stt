# Standalone desktop build (Windows)

Packages the app as a `.exe` folder you can run from a USB drive on any
Windows machine — no Python, Docker, or ffmpeg install required, and the
`tiny`/`base` models are already embedded so transcription works offline
immediately. Background/rationale: `../DEVLOG.md` and the plan this was
built from. This is a separate track from the web/Docker deployment, which
is unaffected by anything here.

## Prerequisites (on a real Windows machine — not WSL)

PyInstaller cannot cross-build a Windows `.exe` from Linux/WSL, so these
steps must run in a native Windows Python, not inside your WSL shell.
Clone/checkout this branch into a normal Windows path (e.g. `C:\dev\...`),
**not** `\\wsl$\...` — building against a WSL-mounted path is slow and can
trip up PyInstaller's file handling.

- Python 3.11+ for Windows (from python.org), on `PATH`.
- This branch checked out at a native Windows path.

## Build steps

```powershell
cd C:\dev\whispergemini-stt   # your native Windows checkout

python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r packaging\requirements-build.txt

# One-time (or whenever you want to refresh the bundled model snapshot):
python scripts\prefetch_models.py

# Optional but recommended: drop the WebView2 "Evergreen Standalone
# Installer" (~130MB, offline-capable — get it from Microsoft's WebView2
# downloads page) at packaging\webview2\MicrosoftEdgeWebview2Setup_standalone.exe
# before building, so the app can self-heal on a machine that's missing the
# WebView2 runtime and has no internet access at the time. Most Windows
# 10/11 machines already have it, so this is a fallback, not a hard
# requirement to get a working build.

pyinstaller packaging\pyinstaller\whisperstt.spec
```

Output lands in `dist\whisperstt\` — that whole folder is the portable
app. `whisperstt.exe` is the entry point.

## Smoke test (do this before trusting a build)

1. Run `dist\whisperstt\whisperstt.exe` directly (double-click, or from a
   terminal to see the console output). A window should open showing the
   app's UI.
2. Confirm the model picker shows `base` (and `tiny`) as already
   downloaded/ready — this should be instant, no progress bar, even with
   networking disabled.
3. Upload or record some audio and transcribe it end-to-end.
4. Try "Format with AI" (needs a real Gemini API key — this hits the
   network, unlike everything else) and an ODT export.
5. **The real portability test**: copy the entire `dist\whisperstt\`
   folder to a USB drive, plug it into a *different* Windows machine, and
   repeat steps 1–4 there. A same-machine test alone doesn't prove
   anything — that machine already has whatever DLLs/runtimes your build
   machine has installed.

If step 5 fails specifically at opening the window (everything else
works), it's very likely the target machine is missing the WebView2
runtime and you skipped bundling the standalone installer above — that's
the one piece of this that couldn't be verified from here (this branch was
developed and dependency-tested from a Linux/WSL sandbox that has no
Windows GUI stack; see the desktop-app plan for what was and wasn't
verified there).

## What already got verified (before you build)

The Python/dependency side of this packaging was smoke-tested with a real
PyInstaller build on Linux (same `--collect-all` logic, same dependency
set) before this branch was handed off for a Windows build: ctranslate2,
tokenizers, av, huggingface_hub, google-genai, pypandoc, imageio-ffmpeg,
uvicorn, and pydantic all import correctly inside a frozen build; the
bundled ffmpeg and pandoc binaries run with their executable bits intact;
the portable `HF_HUB_CACHE` seeding makes `base`/`tiny` show as `ready`
fully offline; and the frontend serves correctly through the frozen-aware
static path. The one thing that *can't* be verified outside real Windows
is the pywebview window itself (it needs the `edgechromium`/WebView2
backend), so that's the focus of the smoke test above.
