# Development log

> This is the original project README, kept as-is and renamed here once it
> grew into more of a running development log/changelog than user-facing
> docs. See `README.md` for setup/usage and `PLAN.md` for the original
> design doc it references below.

Local speech-to-text webapp (upload or mic) built on faster-whisper, with
TXT/Markdown/SRT/ODT output. See `PLAN.md` for the full design and
rationale behind the decisions below.

## Status

- [x] **Phase 1 — Scaffold**: FastAPI backend serving a static frontend shell, `/api/health`, Dockerfile (CPU, with ffmpeg), docker-compose for local dev.
- [x] **Phase 2 — Core pipeline**: `POST /api/transcribe` accepts an uploaded file, normalizes it to 16kHz mono WAV via ffmpeg, runs it through faster-whisper, returns plain text. Verified end-to-end with a real speech sample (mp3 in, correct transcript out).
- [x] **Phase 3 — Remaining formats**: `output_format` param on `/api/transcribe` (`txt` / `md` / `srt` / `odt`), each with correct media type and `Content-Disposition` filename. All four verified end-to-end (SRT timestamps, ODT `content.xml`, invalid format → clean 400).
- [x] **Phase 4 — Frontend**: file upload, mic recording (MediaRecorder), language/format dropdowns, progress status, and a download link with inline preview for text formats — all wired to `/api/transcribe`. Verified in a real headless-Chromium run (file-upload flow and mic-record-via-fake-device flow), including per-format preview behavior (txt/md/srt shown inline, odt correctly treated as binary).
- [x] **Phase 5 — Hardware auto-detection**: `backend/app/hardware.py` probes GPU/CPU/RAM and picks a default engine/model; `GET /api/capabilities` exposes it; `/api/transcribe` accepts `model=auto|tiny|base|small|medium|large-v3`; frontend has a Model dropdown + a hardware-status line. Verified against real hardware (see "GPU inference finding" below) and in a real browser.
- [x] **Phase 6 — Parakeet engine**: optional GPU-only NeMo engine (`backend/app/engines/parakeet_engine.py`), `requirements-gpu.txt`, `Dockerfile.gpu` + `docker-compose.gpu.yml`. `/api/transcribe` and `/api/capabilities` gained an `engine` dimension; frontend has an Engine dropdown that filters Language/Model accordingly. See "What was and wasn't tested" below — the not-available path and all frontend logic are verified; real NeMo/Parakeet inference is not.
- [ ] **Phase 7 — Coolify readiness**: healthcheck wiring, env-based overrides, model-cache volume, deployment docs.
- [x] **Model download progress** (2026-07-12, ahead of Phase 7): `POST /api/models/warmup` + `GET /api/models/status` (`backend/app/model_status.py`), and a progress bar + elapsed-time counter in the frontend, so picking a not-yet-downloaded model shows real feedback instead of an apparently-frozen "Transcribing…". faster-whisper only (not wired for Parakeet). See "Model downloads" below for how it works and a real finding about Hugging Face's newer download backend that shaped the design.
- [x] **AI-formatted output via Gemini** (2026-07-13, ahead of Phase 7): after any transcription, an optional "Format with AI" section lets you paste a Gemini API key and generate a structured Markdown version (headings/paragraphs/lists, light error cleanup) while preserving original wording — for turning a raw transcript into a blog-post draft. Downloadable as `.md` (client-side) or `.odt` (server-side, via `pypandoc-binary`). See "AI formatting" below for what's verified and the design rationale.
- [x] **Creativity control + real UX feedback** (2026-07-14, ahead of Phase 7): reworded the creativity dropdown labels to be concrete rather than subjective ("Ultra creativity" alone meant different things to different people), added a live description line under the dropdown and a hint for the custom-style textarea, fixed a real CSS bug where the textarea wouldn't hide again after deselecting "Custom", and replaced static "please wait" text with a spinner + elapsed-time counter for transcription and genuine token-by-token streaming (SSE) for AI formatting — the formatted text now visibly grows as Gemini writes it. See "AI formatting" below for the CSS bug postmortem and streaming design.
- [x] **Enhance-section polish** (2026-07-14): the two "Download formatted" controls (one `<a>`, one `<button>`) are now visually identical buttons (`.enhance-download-btn`, shared class) instead of a text link and an underlined button with mismatched margins. They also now stay hidden until Gemini's streamed output actually finishes — previously they appeared the instant the result section opened, which for a long transcript meant clickable-looking buttons sitting above an empty/still-filling preview. Both verified with real Playwright bounding-box/visibility checks (see "AI formatting" below), not just DOM attributes.
- [x] **Editable transcript + unified button system** (2026-07-14): the primary transcript preview (`#preview`) is now directly editable in place — remove filler words, fix mistakes — instead of a separate duplicate textarea in the enhance section. Sending to Gemini reads this element's current value directly; no more silently re-transcribing fresh audio behind the scenes just to get an editable copy (was a real backend call every "Generate formatted version" click; now zero extra calls). A "reset to original" link restores the untouched transcript. Only available for textual output formats (txt/md/srt) — picking `odt` makes the preview read-only and keeps the AI-formatting section hidden, since there's no plain text to work from and this design deliberately doesn't fetch one behind your back anymore. Every action button (Transcribe, Download transcript, Generate formatted version, both formatted downloads, mic record) shares one `.btn`/`.btn-primary`/`.btn-secondary` system so the accent color consistently means "this is clickable." Caught and fixed a real regression while first building the (now-removed) separate-textarea version: the elapsed-time ticker for transcription wasn't stopped until the *entire* click handler finished, so it kept overwriting "Done." with stale "Transcribing… Ns elapsed" text during a background fetch — found via a full-page screenshot, not just assertions; worth remembering that screenshots catch things checks don't.
- [x] **Removed the duplicate transcript view** (2026-07-14, follow-up): the separate-textarea design above was itself flagged as confusing — two copies of essentially the same transcript on screen. Collapsed back down to one editable preview (see above bullet, updated in place) that both the download link and the Gemini step read from directly.
- [x] **Paragraph breaks from detected pauses + waveform pause markers** (2026-07-23): faster-whisper's own segments already carry `start`/`end` timestamps from its internal VAD/pause detection, but `to_txt()` used to throw that away and join every segment with a single space — one giant line, no matter how long the recording. `backend/app/formats/paragraphs.py` now groups segments into paragraphs wherever the gap between one segment's end and the next one's start crosses a threshold; `txt`/`md`/`odt` render per-paragraph instead of per-segment (SRT is untouched — subtitle cues stay one-per-segment regardless of pauses). A new **Paragraph breaks** dropdown (Short/Normal/Long pauses → ~0.5s/1s/2s gap, `PAUSE_SENSITIVITY_SECONDS`) lets you tune this per transcription, with a hint line under it explaining what each level does; sent as the new `pause_sensitivity` form field on `/api/transcribe`. The same gap threshold now also drives an `X-Pause-Markers` response header (JSON array of paragraph-start timestamps), which the frontend uses to drop a thin marker line on the source waveform at every detected pause — via wavesurfer's Regions plugin (`regions.esm.js`, vendored into `frontend/static/vendor/wavesurfer/` alongside the existing `wavesurfer.esm.js`/`record.esm.js`, matched to the same pinned version) registered on `sourceWavesurfer` as zero-width regions. Verified: paragraph-grouping logic exercised directly at all three sensitivity levels (confirms short produces more/shorter paragraphs than long, as expected) plus Python/JS syntax checks. Not yet exercised through a real browser transcription — worth a live run to confirm marker positions line up with actual pauses in a real recording, and to sanity-check whether the default 1.0s "normal" threshold feels right against real speech.
- [x] **Speaker diarization + waveform speaker overlays** (2026-08-04, Phase 9): a **Speakers** dropdown (Single/Multiple, default Single so nothing changes unless opted in) sends a new `speakers` form field to `/api/transcribe`. When set to `multiple`, `backend/app/diarization.py` runs `pyannote.audio`'s `pyannote/speaker-diarization-3.1` pipeline (lazily imported and `@lru_cache`d like the Parakeet engine) on the normalized WAV, then `diarize_and_label()` merges the resulting speaker turns onto the existing faster-whisper/Parakeet segments by timestamp overlap (largest-overlap wins on ties) and remaps pyannote's raw `SPEAKER_00`/`SPEAKER_01` labels to first-appearance-ordered `Speaker 1`/`Speaker 2`/... for readability. `engines/base.py`'s `Segment` gained a `speaker: str | None = None` field (defaults to `None` everywhere it isn't set, so the whole single-speaker path is unchanged). `formats/paragraphs.py`'s `group_into_paragraphs()` now also starts a new paragraph on a speaker change (not just a long pause), and `txt`/`md`/`odt`/`srt` all prefix the speaker label when present (`Speaker 1: ...` in txt/odt, `**Speaker 1:**` in md, `[Speaker 1]` above each srt cue). A new `X-Speaker-Segments` response header (JSON array of `{start, end, speaker}`) drives colored, semi-transparent overlay bands per speaker on the source waveform — reusing the same wavesurfer Regions plugin as the pause markers (`renderTranscriptOverlays()` now draws both in one pass: speaker bands first, then pause-marker lines on top), with a fixed color cycled per speaker in first-seen order and click-to-play wired on each region (`region-clicked` → `region.play()`) so you can audition a diarized turn by ear. `GET /api/capabilities` gained `diarization.available` (true only when `pyannote.audio` is importable **and** `HF_TOKEN` is set — checked once at startup, same pattern as `PARAKEET_AVAILABLE`); the frontend disables the "Multiple speakers" option and explains why when it's false. Requires accepting the `pyannote/speaker-diarization-3.1` (and its dependency `pyannote/segmentation-3.0`) model license on huggingface.co under the `HF_TOKEN` account — see `.env.example`. Kept as a separate optional dependency, `requirements-diarization.txt` (`pyannote.audio`, which pulls in PyTorch), rather than folding into `requirements.txt`, matching how Parakeet's GPU deps are kept optional. **Verified**: `group_into_paragraphs()` directly with mixed speaker+pause data (confirms it now splits on speaker change even when the gap is short, and that the no-speaker/single-speaker path renders byte-identical to before this change); all four format renderers against the same fixture (correct speaker prefixes in txt/md/odt, correct `[Speaker N]` line per srt cue); `diarize_and_label()`'s label-remapping and overlap-assignment helpers directly, including the straddling-segment tie-break and the no-overlap-at-all case; `diarization_importable()` returns `False` cleanly with pyannote not installed (this sandbox doesn't have it — same situation as NeMo/Parakeet); Python/JS syntax checks on every changed file. **Not verified**: an actual `pyannote.audio` install (heavy, pulls in PyTorch — not attempted here, same reasoning as skipping `nemo_toolkit` for Parakeet), a real diarization run against real multi-speaker audio, whether the merge/labeling holds up against pyannote's real output shape, or the waveform overlay rendering/click-to-play in an actual browser. Needs a real HF token with the model license accepted, `pip install -r requirements-diarization.txt`, and a real multi-speaker recording before trusting this in practice — the natural next step.
  **Real finding from live Windows testing (2026-08-04):** `pyannote.audio`'s default file-path input decodes audio via `torchcodec`, which needs a system FFmpeg install matching one of its supported major versions exactly (4-8) plus the Windows "full-shared" DLL build — on a real Windows venv this failed to load (`Could not find module '...\torchcodec\libtorchcodec_core8.dll'`) even though the app otherwise started fine (it's a warning, not a startup failure — but diarization itself would fail the moment it actually ran). Fixed in `diarization.py`'s `_load_waveform()`: since `audio.py` already normalizes every upload to 16kHz mono PCM16 WAV via ffmpeg before diarization ever runs, we read that WAV directly with the stdlib `wave` module and hand pyannote an in-memory `{"waveform": tensor, "sample_rate": int}` dict instead of a file path — the exact workaround the library's own warning text suggests. This avoids `torchcodec` (and its Windows FFmpeg-DLL matching problem) entirely, at zero new dependencies. Not yet re-verified on the real Windows machine that hit the original error — worth confirming this actually resolves it.

The frontend now covers engine (faster-whisper, plus parakeet when
available), language (auto/it/en/es, filtered by engine), output format
(txt/md/srt/odt), model (auto or manual tiny…large-v3, faster-whisper
only), upload or mic recording, and an optional AI-formatting pass on the
result.

### Parakeet design notes (Phase 6)

- **Language support is operator-declared, not auto-probed.** The original
  plan said to "probe the loaded model's declared language support," but
  NeMo doesn't expose that consistently across model families/versions —
  so instead `PARAKEET_LANGUAGES` (env var, default `en`) is what the app
  trusts. If you point `PARAKEET_MODEL` at a different checkpoint, update
  `PARAKEET_LANGUAGES` to match what it actually supports.
- **Segment timestamps are best-effort.** Whisper natively returns
  per-segment timestamps; NeMo's word-timestamp API varies by version.
  `parakeet_engine.py` tries to pull word-level timestamps and falls back
  to a single segment spanning the whole file if that fails — meaning SRT
  output from Parakeet may be one long cue instead of properly split
  lines, depending on what the installed NeMo version actually returns.
- **`engine=parakeet` ignores `model`** (Parakeet isn't offered in
  tiny/base/.../large-v3 sizes) and mostly ignores `language` beyond
  validating it's in `PARAKEET_LANGUAGES` — the checkpoint decides what it
  transcribes, there's no language prompt like Whisper's.

### What was and wasn't tested (2026-07-12)

Tested for real, in this sandbox (no nemo_toolkit installed, GPU inference
still broken per the finding below):
- `/api/capabilities` correctly reports `parakeet.available: false`.
- `/api/transcribe` with `engine=parakeet` → clean 400 ("not available on
  this server"); `engine=bogus` → clean 400; `engine=faster-whisper`
  unaffected, still works.
- Frontend, real browser: with Parakeet unavailable, only faster-whisper
  shows in the Engine dropdown, nothing else changes.
- Frontend, real browser with **mocked** `/api/capabilities` (Playwright
  `page.route`) simulating Parakeet being available: Engine dropdown shows
  both options; selecting Parakeet disables `it`/`es` in the Language
  dropdown (keeps `en` and Auto-detect enabled) and disables the Model
  dropdown; switching back to faster-whisper re-enables everything. This
  verifies the actual frontend JS logic without needing a real GPU/NeMo.

**Not tested**: actually installing `nemo_toolkit[asr]`, downloading a real
Parakeet checkpoint, and running inference — `parakeet_engine.py`'s NeMo
API calls (`from_pretrained`, `.transcribe(..., timestamps=True)`, the
`hypothesis.timestamp["word"]` shape) are based on documented NeMo usage
patterns but unverified against a real install in this repo. `nemo_toolkit`
is a heavy install (pulls in a large dependency tree) and this sandbox's
GPU inference is already broken (see below), so there was little to gain
from attempting it here. `Dockerfile.gpu` was also never actually built —
same reasoning as the CPU Dockerfile in Phase 1. Both should get a real
end-to-end run (ideally on a host where GPU inference actually works, e.g.
via `docker compose -f docker-compose.gpu.yml up --build` on a proper CUDA
host) before trusting them in production.

### GPU inference finding (2026-07-12)

`ctranslate2.get_cuda_device_count()` and even loading a model onto
`device="cuda"` can both succeed while actual inference still fails,
because running inference additionally needs `libcublas`/`libcudnn` at
runtime — a separate requirement from device enumeration or model loading.
On this dev machine (WSL2, RTX 2070 8GB passed through), that's exactly
what happens: GPU is visible and `nvidia-smi`-reported, but the venv is
missing those runtime libs, so `hardware.py` correctly falls back to CPU.
`hardware.py`'s `_gpu_inference_smoke_test()` handles this by actually
running a tiny transcription on `cuda` at startup rather than trusting
device enumeration alone — keep that smoke test if you touch this code.

**Fix, confirmed working (2026-07-13, on Windows, RTX 2070, ctranslate2
4.8.1):** the `pip install nvidia-cublas-cu12 nvidia-cudnn-cu12` route is
**Linux-only** per faster-whisper's own docs — don't bother with it on
Windows. What actually worked:

1. Check `nvidia-smi`'s reported CUDA version (newer driver versions show
   `CUDA UMD Version: X.Y` instead of the classic `CUDA Version: X.Y` line
   — same meaning, just relabeled).
2. Download the matching cuBLAS+cuDNN bundle from
   [Purfview/whisper-standalone-win releases (tag: libs)](https://github.com/Purfview/whisper-standalone-win/releases/tag/libs).
   ctranslate2 ≥ 4.5.0 needs **cuDNN 9 + CUDA ≥ 12.3** — skip any "CUDA12_v1"
   variant (still cuDNN 8). Pick **CUDA12_v3** (cuBLAS 12.8.4.1 + cuDNN
   9.8.0.87) if your driver supports CUDA ≥ 12.8, otherwise **CUDA12_v2**
   (cuBLAS 12.4.5.8 + cuDNN 9.5.1.17) for 12.3–12.7. Drivers are backward
   compatible, so a driver reporting a higher CUDA version (e.g. 13.3) is
   fine with the 12.8 bundle.
3. Extract it to a permanent folder (e.g. `C:\nvidia-libs\`) and add that
   folder to `PATH` (System Environment Variables, or
   `$env:Path = "C:\nvidia-libs;" + $env:Path` for a one-off session).
4. Restart the terminal / re-run `uvicorn`. `GET /api/capabilities` should
   now show `gpu_usable: true` and `auto_default.model` should jump up
   (e.g. to `large-v3` for 6-10GB VRAM cards).

This is Windows-specific; on Linux, the pip packages above (or letting
`Dockerfile.gpu`'s CUDA+cuDNN base image provide them) are the equivalent
fix — not yet verified on Linux/Docker in this repo, only reasoned about.

## Config (env vars)

Copy `.env.example` to `.env` (project root) and edit as needed — for
local `uvicorn` dev it's loaded automatically via `python-dotenv` (which
walks up from the current directory, so this works whether you're in the
project root or in `backend/`, verified both ways). Not wired into
`docker-compose.yml`; for Docker or Coolify, set these as real environment
variables through that platform instead.

`WHISPER_MODEL` / `WHISPER_DEVICE` / `WHISPER_COMPUTE_TYPE` default to
whatever `backend/app/hardware.py` auto-detects for the current machine
(see decision matrix in `PLAN.md`) — set any of them to override the
auto-detected value. Per-request `model` (in `/api/transcribe`, and the
frontend's Model dropdown) can further override the model size alone,
without touching device/compute_type. Check `GET /api/capabilities` to
see what was detected and what's currently active.

`PARAKEET_MODEL` (default `nvidia/parakeet-tdt-1.1b`) and
`PARAKEET_LANGUAGES` (default `en`, comma-separated) configure the
optional Parakeet engine — only usable when a GPU passes the startup
inference smoke test *and* `nemo_toolkit` is installed (see
`requirements-gpu.txt` / `Dockerfile.gpu`).

Speaker diarization (the "Multiple speakers" option) has no dedicated env
var — it's available whenever `pyannote.audio` is installed (see
`requirements-diarization.txt`) *and* `HF_TOKEN` is set, checked once at
startup and exposed via `GET /api/capabilities`'s `diarization.available`.
`HF_TOKEN`'s account also needs to have accepted the license for
`pyannote/speaker-diarization-3.1` (and `pyannote/segmentation-3.0`) on
huggingface.co — a valid token alone isn't enough if that step is skipped.

### Model downloads

faster-whisper pulls models from Hugging Face Hub **lazily, on first use**
— not at server startup. Cached at `~/.cache/huggingface/hub`
(Linux/macOS) or `C:\Users\<you>\.cache\huggingface\hub` (Windows),
per-user and outside this repo, so copying the project to a new machine
does **not** bring cached models with it — first use there re-downloads.
Once cached, a model persists across app restarts on the same machine (it's
tied to that OS-level cache dir, not to the running process) — you only
pay the download cost once per machine per model size.

The frontend shows real download progress now: clicking Transcribe first
calls `POST /api/models/warmup` for the selected model (faster-whisper
only), which kicks off the download in a background thread if needed and
returns immediately; if the model isn't ready yet, the UI polls
`GET /api/models/status` every second and shows a progress bar (%,
MB downloaded/total, MB/s) plus an elapsed-time counter, until the model's
ready — then transcription proceeds automatically. If the model is already
cached, none of this shows and it goes straight to "Transcribing…".

**Real finding from testing this (2026-07-12):** Hugging Face's newer
"Xet" transfer backend (used for at least the `Systran/faster-whisper-*`
repos) downloads in parallel content-addressed chunks rather than one
smooth stream — on-disk bytes can sit completely flat for 20-30 seconds
during transfer setup, then jump in large bursts. A percent/MB-only
progress bar looked *exactly* as frozen as the thing it was built to
replace during that window. That's why the elapsed-time counter always
ticks independent of byte progress — verified this by watching the actual
`~/.cache/huggingface/hub/.../blobs/*.incomplete` file size directly every
second during a real download (see git history / session notes if you need
the raw numbers) before trusting the polling approach.

Also verified (and worth knowing if you touch `model_status.py`):
`get_faster_whisper_engine()` is `@lru_cache`d by model size — if a
model's on-disk cache is ever deleted while its engine is still in that
in-memory cache (only realistic in manual testing, not normal operation),
`warm_up()` silently no-ops because the lru_cache returns the already-loaded
object without re-touching disk, and `/api/models/status` would report
`not_started` forever. Not a problem in real usage (disk and process state
don't drift apart on their own), but worth knowing if progress ever
appears stuck at 0% with zero bytes moving for an already-should-exist
model — check whether the process was already holding that model in
memory.

For a first run on a new machine, picking `tiny` or `base` explicitly in
the Model dropdown gives a much faster first download than trusting
"Auto" (which may pick something much larger depending on detected
hardware).

### AI formatting (Gemini)

After any transcription (with a **textual** output format — `txt`/`md`/`srt`;
`odt` has no plain text to work from, so this section stays hidden in
that case), the frontend shows an optional "Format with AI" section. It
sends whatever's currently in the transcript preview textarea — editable
in place, so you can remove filler words or fix mistakes before sending —
to Google's Gemini API, asking it to add Markdown structure (headings,
paragraphs, lists) and fix obvious transcription errors. Meant for
turning a raw transcript into a blog-post draft. A "reset to original"
link restores the untouched transcribed text if you want to discard
edits. This reads directly from the one preview element that's already
on screen — there's deliberately no second copy or hidden re-transcription
call to keep in sync; an earlier version of this feature did exactly that
(a separate textarea, auto-filled via its own backend call) and it was
correctly flagged as confusing duplication, so it was removed.

**Creativity levels** (2026-07-13, reworded 2026-07-14 for clarity after
"ultra creativity means different things to different people" feedback):
a dropdown controls how much liberty Gemini takes with rewording —
`verbatim` (fix errors only, temp 0.15) → `light` (clean up phrasing) →
`moderate` (reworded for readability) → `high` (polished blog prose) →
`ultra` (full rewrite, temp climbing to 1.0), plus `custom` for a
free-text style/tone prompt (e.g. "write like a casual, witty tech
blogger"). Each level's label, a one-line plain-English description, and
its actual prompt instruction live together in `backend/app/enhance.py`'s
`CREATIVITY_PRESETS` — the frontend fetches labels/descriptions from
`GET /api/enhance/options` rather than duplicating this text in HTML/JS,
so they can't drift out of sync. The description updates live under the
dropdown as you change the selection. The custom-style textarea shows a
brief one-line hint ("describe tone and voice, not content — e.g. ...")
alongside its placeholder example. **One rule applies at every level,
including `ultra` and `custom`**: Gemini is explicitly told not to invent
facts, claims, names, or details that weren't in the original transcript
— creativity only changes *how* content is expressed, never *what*
content exists. This is what keeps the tool trustworthy even at high
creativity — otherwise "ultra creative" could mean "makes things up."
Selected creativity level and custom style text are persisted in
`localStorage` alongside the API key.

- `GET /api/enhance/options` → `{"presets": {key: {label, description}}, "custom_description": "..."}`,
  single source of truth for the dropdown + info text.
- `POST /api/enhance/stream` (`text`, `api_key`, optional `model`,
  `creativity`, `custom_style`) → Server-Sent Events stream of Gemini's
  output as it's generated (`data: {"chunk": "..."}` events, then
  `{"done": true}`, or `{"error": "..."}` on failure). The frontend uses
  this — the formatted text visibly grows in the preview as Gemini writes
  it, which is real progressive output, not a fake progress indicator.
  Consumed via `fetch()` + manual `ReadableStream` reading rather than the
  browser's `EventSource` API, since `EventSource` only supports GET and
  this needs to POST form data (text + API key). The result section
  (preview `<pre>`) is revealed as soon as streaming starts, so the text
  visibly grows — but the `#enhance-downloads` div (both download buttons)
  stays `hidden` until `streamEnhance()` fully resolves, set right after
  `enhanceResult.hidden = false` on each new attempt so a stale previous
  result's buttons don't stay visible during a new run. Verified with a
  Playwright test that artificially delays the mocked SSE response by
  1.5s: confirmed the result/preview area is visible while downloads stay
  hidden mid-stream, and downloads only become visible after the "Done."
  status appears.
- `POST /api/enhance` (same params, no streaming) → still exists,
  returns `{"markdown": "..."}` in one shot — kept mainly because it's
  much easier to `curl` for quick backend testing than parsing SSE frames
  by hand. `format_transcript()` is now just `"".join(...)` over the same
  streaming generator both endpoints share, so there's one code path for
  the actual Gemini call.
- Invalid `creativity` values or an empty `custom_style` when
  `creativity=custom` are rejected locally with a clean 400 (or SSE
  `error` event) *before* any Gemini API call is made — verified this
  returns in ~7ms, confirming it's a local check, not a wasted network
  round trip.
- `POST /api/enhance/odt` (`markdown`) → converts to a real ODT via
  `pypandoc-binary` (`backend/app/markdown_odt.py`) — this is a pip
  package that bundles its own pandoc binary, so **no separate system
  pandoc install is needed** (unlike ffmpeg, which is a real system
  dependency). Verified: headings, bold/italic, and bullet lists all
  convert correctly to genuine ODT structure, not just plain paragraphs.
- The `.md` download happens entirely client-side (the markdown text is
  already in the browser after the `/api/enhance` call — no extra
  request needed).
- `GEMINI_MODEL` env var (default `gemini-3.5-flash`) sets the model if
  you don't want the default. `gemini-2.5-flash` was the original default
  but Google deprecated it for new API keys sometime before its official
  Oct 16 2026 shutdown date — hit this for real via a live 404 from the
  API, not from docs. `gemini-3.5-flash` is the officially documented
  replacement (no shutdown announced). If cost matters more than quality
  for your use case, `gemini-3.1-flash-lite` is ~6x cheaper per token
  ($0.25/$1.50 vs $1.50/$9.00 per 1M input/output tokens) and is Google's
  documented replacement for the old cheaper `2.5-flash-lite` tier — both
  have a free tier for testing before deciding.

**API key handling**: entered in a password-masked field, persisted only
in the browser's `localStorage` (survives page reloads for convenience),
sent to our own backend per-request and never written to disk or logged
server-side. The key only ever leaves your machine going to Google's API.

**CSS bug postmortem (2026-07-14) — worth remembering for any future
`hidden`-toggled element:** the custom-style textarea's `<label>` had the
`hidden` attribute toggled correctly by JS (`element.hidden = true/false`)
but stayed visibly on screen even when `hidden` was `true`. Cause: `.enhance
label { display: flex; ... }` (needed so the label's text and input stack
vertically) has higher CSS specificity than the browser's default
`[hidden] { display: none }` rule, so once *any* selector explicitly sets
`display` on an element, the `hidden` attribute stops actually hiding it —
it's still removed from the accessibility tree and `element.hidden` still
reads `true`, but it's visibly still there. My first test only checked
`getAttribute("hidden")`, which is exactly why it didn't catch this — the
*attribute* was toggling correctly, only the *rendering* wasn't. Fixed
globally with `[hidden] { display: none !important; }` (a well-established
pattern, not a one-off patch on `.enhance label`) so this can't silently
recur elsewhere. If you add a new `hidden`-toggled element and it doesn't
seem to be hiding, check for a conflicting explicit `display` rule first —
and test with real rendered visibility (`page.locator(...).isVisible()` in
Playwright, or `getComputedStyle`), not just the DOM attribute.

**What was and wasn't tested (2026-07-13):** I don't have (and didn't ask
for) a real Gemini API key, so the actual formatting output was never
verified. What *was* verified for real: the full request wiring against
the live Gemini API with an intentionally invalid key — got back a real
structured error from Google's servers, which our error handling surfaced
cleanly as a 400 rather than crashing — confirming the SDK integration
itself (`google-genai`, `client.models.generate_content` with
`system_instruction`) is wired correctly end-to-end, just unverified for
what a *successful* response actually contains. The user then hit the
`gemini-2.5-flash` deprecation for real on their first live attempt (see
above) — after switching the default to `gemini-3.5-flash`, re-ran the
same invalid-key test and got the identical "API key not valid" error
(not a "model not found" one), confirming the new model name itself
resolves correctly, independent of key validity. Also verified for real:
`/api/enhance/odt`'s pandoc conversion with realistic Markdown, and the
full frontend flow (snapshot-and-re-transcribe, localStorage persistence,
preview rendering, both downloads) via Playwright with `/api/enhance`
mocked to return canned Markdown — note "snapshot-and-re-transcribe" here
describes the design as it was on 2026-07-13; it no longer re-transcribes,
see the "Editable transcript" status entry and the AI formatting section
above for the current (2026-07-14) design. For creativity levels specifically:
verified for real against the live API (invalid key, so past prompt
construction but not a successful generation) for both a preset
(`creativity=high`) and `custom` with a style prompt — confirming the
prompt-building code path works for both branches. Verified locally
without any API call: unknown `creativity` value and empty `custom_style`
under `creativity=custom` are both rejected with a clean 400 before
reaching Gemini. Verified in a real browser: the custom-style textarea
show/hide toggle, form data correctly carrying `creativity`/`custom_style`
through to the request, and localStorage persistence of both. **Not
verified**: what the actual generated output looks like at any creativity
level, or whether the "don't invent facts" grounding rule holds up in
practice, especially at `ultra` — that needs a real API key and human
judgment on real transcripts, which is the natural next thing to try.

**2026-07-14 round (labels/descriptions, CSS fix, spinner/streaming)
additionally verified:** `GET /api/enhance/options` returns the expected
preset labels/descriptions; `/api/enhance/stream`'s SSE framing tested
directly with `curl -N` against the live API (invalid key → a proper
`data: {"error": "..."}` event, correctly parseable); the custom-creativity
local-validation-before-network-call claim confirmed by timing (~7ms
response, no way that includes a real API round trip). In a real browser:
the CSS visibility fix confirmed with actual `page.locator(...).isVisible()`
checks (not just the attribute, per the postmortem above) through a full
toggle cycle (hidden → custom selected → visible → high selected → hidden
again); the transcribe spinner + ticking elapsed-time text confirmed
present mid-request; the enhance spinner confirmed present; and SSE
streaming parsing confirmed against a mocked multi-chunk response (four
separate `data:` events plus a `done` event, all correctly accumulated
into the final text and preview updated progressively). Note the mocked
SSE test verifies *parsing correctness*, not the real-time visual pacing —
Playwright's `route.fulfill` delivers the whole mocked body at once, so
the actual "watch it type" pacing (chunks arriving with real network
timing between them) has only been confirmed against the live API's error
path, not a full successful generation.

## Local dev (without Docker) — Linux/macOS

Requires `ffmpeg` on `PATH` (`sudo apt-get install -y ffmpeg` on
Debian/Ubuntu, `brew install ffmpeg` on macOS).

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Visit http://localhost:8000

Try a transcription (downloads the `small` model on first run):

```bash
curl -X POST http://localhost:8000/api/transcribe \
  -F "file=@/path/to/audio.mp3" \
  -F "language=en" \
  -F "output_format=srt" \
  -o transcript.srt
```

`language` is optional — omit it (or pass an empty value) for auto-detect.
`output_format` is one of `txt` (default), `md`, `srt`, `odt`.
`pause_sensitivity` is optional (`short`/`normal`/`long`, default `normal`)
— see "Paragraph breaks from detected pauses" below. `speakers` is optional
(`single`/`multiple`, default `single`) — see "Speaker diarization" above;
`multiple` requires `requirements-diarization.txt` installed and `HF_TOKEN`
set, or the request returns a clean 400.

## Local dev (without Docker) — Windows

Requires Python 3.11+ (python.org) and `ffmpeg` on `PATH`. Easiest way to
get ffmpeg: `winget install ffmpeg` (or `choco install ffmpeg`, or a manual
build from gyan.dev/ffmpeg/builds with its `bin` folder added to PATH).

PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Visit http://localhost:8000 and test through the browser UI.

**Verified working on real Windows (2026-07-13)**, on an RTX 2070 + 32GB
RAM machine: app starts cleanly, `ctypes`/`GlobalMemoryStatusEx` RAM
detection reports correctly (`ram_mb: 32699`, `cpu_count: 12`), GPU is
detected via `nvidia-smi`, transcription works end-to-end (upload →
correct text), and after following the GPU library fix below, real GPU
inference also works (`gpu_usable` flipped to `true`, auto-default jumped
to `large-v3`). Not yet verified on this same setup: mic recording with a
genuine human voice (only synthetic fake-device audio has been tested via
headless Chromium so far) — worth trying next.

## Local dev (Docker)

```bash
docker compose up --build
```

Visit http://localhost:8000. ffmpeg is already installed in the image.
(Not yet tried end-to-end in this repo — Phase 1's Dockerfile build itself
was never actually run, only reasoned about. Worth doing a real
`docker compose up --build` before relying on it.)

## Picking this back up

Immediate next step: **live-verify speaker diarization** (2026-08-04's
feature, see its status entry above) — install `requirements-diarization.txt`,
get a real `HF_TOKEN` with the `pyannote/speaker-diarization-3.1` license
accepted, and run a real multi-speaker recording through the "Multiple
speakers" option to confirm the merge/labels/waveform overlays hold up
against real pyannote output, not just the fixture-based unit checks.

After that: **Phase 7 — Coolify readiness** (healthcheck wiring, env-based
overrides, model-cache volume, deployment docs). See `PLAN.md` for the
full phase breakdown and architecture rationale, the "GPU inference
finding" note above before touching `hardware.py`, and the Parakeet
"What was and wasn't tested" note above before trusting `Dockerfile.gpu`
or `parakeet_engine.py` in production — both need a real run on an actual
GPU host.
