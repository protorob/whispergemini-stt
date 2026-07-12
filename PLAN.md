# am-whisper-stt — Plan

Local-first speech-to-text webapp: upload a file or record from the mic,
transcribe with an auto-selected (or manually chosen) Whisper-family engine,
download as TXT / Markdown / SRT / ODT. Runs locally first, deployable to
Coolify later.

## Decisions made so far

| Topic | Decision | Notes |
|---|---|---|
| Primary engine | `faster-whisper` (CTranslate2) | Fast, low memory, CPU+GPU, all model sizes incl. `large-v3`. |
| Secondary engine | NVIDIA **Parakeet** via NeMo | Optional, GPU-only, offered when hardware supports it. |
| Languages | Italian, English, Spanish (+ auto-detect) | Extensible list; Parakeet's language support checked at runtime (see below). |
| Model/engine selection | **Auto-detected from hardware** at startup, with manual override | UI defaults to "Auto (recommended)"; dropdown is filtered to what the current hardware can actually run. |
| Audio decoding | **ffmpeg included**, used as a normalization step | See rationale below — not strictly required by faster-whisper alone, but needed for consistent behavior across engines and useful for future audio features. |
| Frontend | Single-page vanilla HTML/CSS/JS served by the backend | No build step, simplest to containerize. Can swap to React later if it outgrows this. |
| Backend | FastAPI (Python) | One process serves the API and the static frontend. |
| Deployment | Docker, later on Coolify | CPU and GPU image variants (see Deployment section). |

Open items I made a default call on (flag if you want something different):
- Output format is **one selected format per request** (not multi-select) — simpler UI, can add multi-select later.
- Up to 1-2 loaded models kept warm in memory (LRU) to bound RAM/VRAM use when switching engines/models between requests.

## Why ffmpeg, even though faster-whisper doesn't strictly need it

`faster-whisper` decodes audio via `PyAV`, which bundles its own compiled
FFmpeg libraries in the wheel — so on its own it already handles mp3/m4a/webm
etc. without a system `ffmpeg` binary.

We're including `ffmpeg` anyway as a **normalization step before any engine**
(convert every input to canonical 16kHz mono WAV) because:

1. **Parakeet/NeMo is pickier.** It decodes via `soundfile`/`librosa`, which
   has weak/version-dependent MP3 support and no native webm/opus support —
   and the browser's `MediaRecorder` produces webm/opus. Normalizing up front
   means every engine sees the same clean WAV, so engines are freely
   swappable.
2. **Future features**: silence trimming, chunking long files for progress
   feedback, extracting audio from video uploads, volume normalization,
   waveform previews for the UI.
3. **Robustness** against edge-case containers PyAV might choke on.

Cost: ~50-80MB apt layer with `--no-install-recommends`. Worth it.

## Hardware auto-detection & model selection

A `hardware.py` module runs once at startup (cached, re-probeable via an
admin endpoint):

- GPU: `torch.cuda.is_available()`, device name, total VRAM
  (`torch.cuda.get_device_properties(0).total_memory`).
- CPU/RAM: `os.cpu_count()`, `psutil.virtual_memory().total`.

Decision matrix (defaults; always overridable in the UI):

| Hardware | Default engine | Default model |
|---|---|---|
| GPU, VRAM ≥ 10GB | faster-whisper | `large-v3` (float16) |
| GPU, VRAM 6-10GB | faster-whisper | `large-v3` (int8_float16) |
| GPU, VRAM 3-6GB | faster-whisper | `medium` |
| GPU, VRAM < 3GB | faster-whisper | `small` (int8) |
| No GPU, RAM ≥ 16GB | faster-whisper | `medium` (int8) |
| No GPU, RAM 8-16GB | faster-whisper | `small` (int8) |
| No GPU, RAM < 8GB | faster-whisper | `base` (int8) |

Parakeet is only ever offered as a manual-override option when a GPU is
present. Because Parakeet's multilingual coverage is narrower than Whisper's
(mainline models are English-only; multilingual variants cover a limited,
release-dependent set of languages), at startup we probe the loaded
Parakeet model's declared language support and only enable it in the
language dropdown for IT/EN/ES if that specific model actually supports
them. If it only supports English, it'll show up as an option only when
English is selected.

`GET /api/capabilities` exposes: detected hardware summary, the
auto-selected default, and the full list of engine/model/language
combinations valid on this box — the frontend uses this to populate and
grey out dropdown options instead of hardcoding assumptions.

## Architecture

```
am-whisper-stt/
  backend/
    app/
      main.py              # FastAPI app, routes
      config.py             # env-driven settings
      hardware.py           # GPU/CPU/RAM probe + selection matrix
      audio.py               # ffmpeg normalization subprocess wrapper
      engines/
        base.py              # Transcriber interface
        faster_whisper_engine.py
        parakeet_engine.py    # optional import, only active w/ GPU+NeMo installed
      formats/
        txt.py
        markdown.py
        srt.py
        odt.py                 # via odfpy, no LibreOffice dependency
    requirements.txt
    requirements-gpu.txt        # extra: torch+cuda, nemo_toolkit (Parakeet)
  frontend/
    index.html
    static/
      app.js                    # upload, MediaRecorder mic capture, dropdowns, download
      style.css
  Dockerfile              # CPU image
  Dockerfile.gpu           # CUDA base image, for GPU hosts
  docker-compose.yml        # local dev, mounts a model-cache volume
  .env.example
  README.md
  PLAN.md                    # this file
```

### API surface

- `GET /` — serves the frontend.
- `GET /api/capabilities` — hardware summary + valid engine/model/language matrix + current auto-default.
- `POST /api/transcribe` — multipart upload (file or recorded blob) + params `{language, engine, model, output_format}` (each optional, default `"auto"`). Returns the generated file.
- (later) `GET /api/health` — for Coolify healthchecks.

### Engine abstraction

`engines/base.py` defines a `Transcriber` protocol: `transcribe(wav_path, language) -> list[Segment]`
where `Segment = {start, end, text}`. Both engines implement this so the
format generators (`formats/*.py`) and the API layer never know which
engine produced the segments.

Models are loaded lazily on first use per `(engine, model)` key and kept in
an LRU cache (size 1-2) so switching between, say, `small` and `large-v3`
across requests doesn't require a cold reload every time, while bounding
memory use.

### Output formats

- **txt** — plain concatenated text.
- **md** — text with optional `##` timestamp headers per segment.
- **srt** — standard SubRip generated from segment start/end timestamps.
- **odt** — built with `odfpy` (pure Python, no LibreOffice/soffice dependency needed).

### Frontend

Single static page:
- File picker + drag-drop upload.
- Mic recording via `MediaRecorder` (webm/opus), with a record/stop button and basic level indicator.
- Language dropdown (Auto-detect, Italian, English, Spanish), filtered by `/api/capabilities` when engine=Parakeet.
- Engine/model dropdown: "Auto (recommended)" default + manual list, greyed out for unsupported combos.
- Output format select: txt / md / srt / odt.
- Progress indicator (large-v3 on CPU can take a while) and a download button for the result.

## Deployment (Coolify)

- `Dockerfile` (CPU): `python:3.11-slim` + `ffmpeg` + `faster-whisper` stack. Small, works anywhere.
- `Dockerfile.gpu`: `nvidia/cuda` runtime base + `ffmpeg` + `faster-whisper` + `torch` (CUDA) + `nemo_toolkit` for Parakeet. Much larger image (~several GB); only used when deploying to a host with a passed-through GPU.
- Model cache persisted to a volume (`/root/.cache/huggingface` or similar) so models aren't re-downloaded on every container restart/redeploy.
- `GET /api/health` wired up for Coolify's healthcheck.
- Config via env vars: `FORCE_ENGINE`, `FORCE_MODEL`, `MAX_UPLOAD_MB`, etc., to override auto-detection if needed on a specific host.

## Implementation phases

1. ✅ **Scaffold**: FastAPI app skeleton, static frontend shell, Dockerfile (CPU), docker-compose for local dev.
2. ✅ **Core pipeline**: ffmpeg normalization → faster-whisper engine → txt output. Get one format end-to-end working first.
3. ✅ **Remaining formats**: md, srt, odt generators.
4. ✅ **Frontend**: upload + mic recording + format/language dropdowns wired to the API.
5. ✅ **Hardware auto-detection**: `hardware.py` + `/api/capabilities` + wire "Auto" into engine/model selection. Detection does a real inference smoke test, not just device enumeration — see README's "GPU inference finding".
6. ✅ **Parakeet (optional engine)**: added `requirements-gpu.txt`, `parakeet_engine.py`, `Dockerfile.gpu` + `docker-compose.gpu.yml`. Language support ended up **operator-declared via `PARAKEET_LANGUAGES`** rather than probed from the model at runtime (NeMo doesn't expose that reliably across model families) — see README's Parakeet design notes. Real NeMo/GPU inference untested in this sandbox; only the not-available path and frontend logic were verified for real (README has the exact breakdown).
7. ⬜ **Coolify readiness**: healthcheck endpoint, env-based config overrides, volume for model cache, deployment docs in README.
8. ✅ **AI-formatted output (Gemini)**, added ahead of Phase 7: `POST /api/enhance` (Gemini formatting, structure + light cleanup, explicitly not summarization) and `POST /api/enhance/odt` (via `pypandoc-binary` — no system pandoc install needed, unlike ffmpeg). Frontend section with a localStorage-persisted API key field. See README's "AI formatting" section for exactly what's verified — the SDK wiring is confirmed against the live API (tested with an invalid key), but no real successful generation has been reviewed yet.

Detailed per-phase status, what was actually verified, and open TODOs live
in `README.md`'s Status section — check there before resuming.
