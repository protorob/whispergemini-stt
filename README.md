# am-whisper-stt

A self-hosted speech-to-text web app. Upload an audio file or record from
your mic in the browser, transcribe it locally with
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) (CPU or GPU),
and optionally clean up the result into structured Markdown with Google
Gemini. Everything runs on your own machine — audio never leaves it, and
the transcript only leaves if you explicitly send it to Gemini for
formatting.

## Features

- Upload an audio/video file, or record straight from your microphone
- Transcription via **faster-whisper**, with an optional GPU-only
  **Parakeet** engine
- Automatically detects your hardware (GPU/CPU/RAM) and picks a sensible
  default model — or pick one manually
- Output as plain text, Markdown, SRT subtitles, or ODT
- Transcript preview is directly editable before you download it
- Optional "Format with AI" pass (Gemini) that turns a raw transcript into
  clean Markdown, with an adjustable creativity level, without inventing
  facts that weren't in the original audio

## Requirements

| Requirement | Needed for |
|---|---|
| Python 3.11+ | running the backend locally (not needed if using Docker) |
| [ffmpeg](https://ffmpeg.org/) on `PATH` | normalizing uploaded/recorded audio |
| Docker + Docker Compose | containerized setup (optional, simplest path) |
| NVIDIA GPU + CUDA drivers | GPU-accelerated transcription (optional — CPU works fine, just slower) |
| A free [Gemini API key](https://aistudio.google.com/app/apikey) | the optional "Format with AI" feature only |

## Quickstart

### Option A — Docker

```bash
docker compose up --build
```

Visit **http://localhost:8000**. ffmpeg is already included in the image.
Downloaded models persist across restarts in a named Docker volume.

For GPU support, use the GPU compose file instead (requires the NVIDIA
Container Toolkit on the host):

```bash
docker compose -f docker-compose.gpu.yml up --build
```

### Option B — Local Python (Linux/macOS)

```bash
sudo apt-get install -y ffmpeg   # or: brew install ffmpeg
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Visit **http://localhost:8000**.

### Option B — Local Python (Windows)

Requires Python 3.11+ from [python.org](https://www.python.org/) and
ffmpeg on `PATH` (`winget install ffmpeg` is the easiest route).

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Visit **http://localhost:8000**.

> **Windows note:** the first time a model downloads, Windows may block
> the cache from creating symlinks unless Developer Mode is turned on
> (Settings → Privacy & security → For developers). If a download seems
> to fail or stall, see [Troubleshooting](#troubleshooting) below.

## Using the app

1. **Upload** a file or **record** from your microphone.
2. Pick an **engine** (faster-whisper, or Parakeet if a compatible GPU is
   detected), **language** (or leave on auto-detect), **output format**,
   and **model** (or leave on "Auto" to use the recommended one for your
   hardware).
3. Click **Transcribe**.
   - If the selected model hasn't been downloaded yet, you'll see a real
     progress bar first — this only happens once per model, per machine.
4. Once done, the transcript appears in an **editable preview**. Edit it
   if you like, then download it, or click **Format with AI** to send it
   to Gemini for a cleaned-up Markdown version (paste your API key the
   first time — it's stored only in your browser).

## Configuration

Copy `.env.example` to `.env` in the project root and edit as needed —
for local `uvicorn` runs it's picked up automatically. For Docker/Coolify,
set these as real environment variables on that platform instead (`.env`
is not wired into `docker-compose.yml`).

| Variable | Default | Purpose |
|---|---|---|
| `HF_TOKEN` | *(none)* | Hugging Face access token — avoids download rate limits/failures when fetching models. [Create one here](https://huggingface.co/settings/tokens) (read-only access is all that's needed). |
| `WHISPER_MODEL` | auto-detected | Force a specific faster-whisper model size (`tiny`/`base`/`small`/`medium`/`large-v3`) instead of the hardware-based default. |
| `WHISPER_DEVICE` | auto-detected | Force `cpu` or `cuda`. |
| `WHISPER_COMPUTE_TYPE` | auto-detected | e.g. `int8`, `float16`, `int8_float16`. |
| `PARAKEET_MODEL` | `nvidia/parakeet-tdt-1.1b` | Which Parakeet checkpoint to use (GPU-only engine). |
| `PARAKEET_LANGUAGES` | `en` | Comma-separated languages the configured Parakeet model actually supports. |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Default Gemini model for AI formatting. |

Check `GET /api/capabilities` at any time to see what hardware was
detected and which settings are currently active.

## Model downloads

faster-whisper models download from Hugging Face **the first time you use
them**, not at startup — cached under your user profile
(`~/.cache/huggingface/hub` on Linux/macOS,
`C:\Users\<you>\.cache\huggingface\hub` on Windows), so each model is only
downloaded once per machine. The UI shows a real progress bar during this.
If you're setting this up on a new machine, picking `tiny` or `base`
explicitly gives a much faster first run than trusting "Auto" (which may
pick a multi-GB model depending on your hardware).

## Troubleshooting

**Transcription seems stuck, GPU/CPU both near 0% usage.**
The selected model is probably still downloading in the background — the
UI now shows an honest progress bar for this, so update if you're on an
older version and it just says "Transcribing…" with no visible progress.

**Windows: model download fails with a "privilege not held" or symlink
error.** Hugging Face's cache uses filesystem symlinks by default, which
Windows blocks without extra permission. Enable **Developer Mode**
(Settings → Privacy & security → For developers) and fully restart the
backend (close and reopen the terminal, not just re-run) so the new
permission takes effect.

**Windows: console warning about "unauthenticated requests" / downloads
failing partway through.** Set `HF_TOKEN` (see [Configuration](#configuration))
— anonymous downloads are rate-limited and can fail on large files like
`large-v3`.

**"GPU acceleration active" is shown, but it's clearly not using the
GPU.** GPU device detection and actually running inference on it are two
different things — a missing cuDNN/cuBLAS runtime can pass the former and
fail the latter. See the GPU inference notes in `DEVLOG.md` for the exact
Windows fix (installing the matching cuBLAS+cuDNN library bundle).

**`ffmpeg: command not found` or audio fails to normalize.** ffmpeg isn't
on `PATH` — see the install commands in [Quickstart](#quickstart) above.

## Project structure

```
backend/app/main.py            FastAPI app and routes
backend/app/hardware.py        GPU/CPU/RAM detection, default model selection
backend/app/model_status.py    Model download progress tracking
backend/app/audio.py           ffmpeg-based audio normalization
backend/app/engines/           Transcription engines (faster-whisper, Parakeet)
backend/app/enhance.py         Gemini-based AI formatting
backend/app/formats.py         Output format rendering (txt/md/srt/odt)
frontend/                      Static HTML/CSS/JS frontend
```

## Further reading

- **`PLAN.md`** — the original design doc and architecture rationale.
- **`DEVLOG.md`** — a detailed running history of how each feature was
  built, tested, and debugged (useful if you're extending this project
  and want the "why" behind a decision, or the exact fix for a hardware
  quirk hit along the way).
