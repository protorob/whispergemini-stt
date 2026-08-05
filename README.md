# Cassiodorus

*Ancient diligence. Modern intelligence.*

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
- Automatic paragraph breaks wherever Whisper detects a pause, with an
  adjustable **Paragraph breaks** sensitivity (short/normal/long) — the
  same pauses are also marked directly on the audio waveform
- Transcript preview is directly editable before you download it
- Optional speaker diarization ("Multiple speakers") — labels each part
  of the transcript by who's speaking, with colored overlay bands on the
  waveform (requires `pyannote.audio` installed and `HF_TOKEN` set, see
  [Configuration](#configuration))
- Optional "Format with AI" pass (Gemini) that turns a raw transcript into
  clean Markdown, with an adjustable creativity level, without inventing
  facts that weren't in the original audio
- Light/dark theme (follows your OS by default, or override with the
  sun/moon toggle) and an in-app "About" popup covering how it works
- Your current session (audio, transcript, edits, AI-formatted result)
  survives a page reload — stored in your browser only, cleared by an
  explicit Delete

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

Visit **http://localhost:8000**. Add `--port 8001` (or any other free port)
if 8000 is already taken by something else.

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

Visit **http://localhost:8000**. Add `--port 8001` (or any other free port)
if 8000 is already taken by something else.

> **Windows note:** the first time a model downloads, Windows may block
> the cache from creating symlinks unless Developer Mode is turned on
> (Settings → Privacy & security → For developers). If a download seems
> to fail or stall, see [Troubleshooting](#troubleshooting) below.

## Using the app

1. **Upload** a file or **record** from your microphone.
2. Pick an **engine** (faster-whisper, or Parakeet if a compatible GPU is
   detected), **language** (or leave on auto-detect), **output format**,
   **model** (or leave on "Auto" to use the recommended one for your
   hardware), **Paragraph breaks** sensitivity (how long a pause should
   start a new paragraph — see the hint under the dropdown for what each
   level does), and **Speakers** (Single, or Multiple if diarization is
   available on this server — labels each part of the transcript by
   who's speaking).
3. Click **Transcribe**.
   - If the selected model hasn't been downloaded yet, you'll see a real
     progress bar first — this only happens once per model, per machine.
4. Once done, the transcript appears in an **editable preview**, broken
   into paragraphs wherever Whisper detected a long-enough pause (same
   pauses are marked on the waveform above). Edit it if you like, then
   download it, or click **Format with AI** to send it to Gemini for a
   cleaned-up Markdown version (paste your API key the first time — it's
   stored only in your browser).

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
| `MAX_UPLOAD_MB` | `1024` | Max upload size in MB. Kept well under the browser's hard ~2GB limit on `decodeAudioData`/`fetch` bodies — raising this past ~1800 risks the upload failing client-side with a confusing error instead of the clean 413 this produces. |

Check `GET /api/capabilities` at any time to see what hardware was
detected and which settings are currently active.

**Speaker diarization** ("Multiple speakers" in the UI) is a separate
optional install — `pip install -r backend/requirements-diarization.txt`
(pulls in PyTorch) — and needs the same `HF_TOKEN` above, whose account
must have separately accepted the `pyannote/speaker-diarization-3.1`
license on huggingface.co. Both conditions are checked once at startup
and exposed via `GET /api/capabilities`; if either is missing, the
"Multiple speakers" option is disabled in the UI with an explanation
rather than failing at request time.

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
backend/app/formats/           Output format rendering (txt/md/srt/odt) +
                                pause-based paragraph grouping
frontend/                      Static HTML/CSS/JS frontend
```

## Further reading

- **`PLAN.md`** — the original design doc and architecture rationale.
- **`DEVLOG.md`** — a detailed running history of how each feature was
  built, tested, and debugged (useful if you're extending this project
  and want the "why" behind a decision, or the exact fix for a hardware
  quirk hit along the way).
- **`BRAND.md`** — naming, color palette, typography, and voice/tone
  guidelines for the Cassiodorus rebrand.
- **`DEPLOYMENT.md`** — notes from a planning discussion on hosting and
  monetization directions (browser-side compute, a paid cloud tier) —
  not yet built, captured for when that work actually starts.
