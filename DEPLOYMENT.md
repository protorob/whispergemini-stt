# Deployment & Product Direction — Notes

Captured from a planning discussion on 2026-08-04, before any of this is
built. Three questions came up about where this project could go beyond
"runs locally on your own machine." **#1 and #2 are deferred** — real
architecture decisions to revisit later, not started. **#3 (client-side
session persistence) is implemented** — see the bottom of this doc and
`frontend/static/app.js`.

## 1. Cheap VPS + browser-only compute (deferred)

Possible, but it means a different transcription engine, not a config
flag. `faster-whisper` runs on CTranslate2 — a native library, not
something a browser can execute. Running Whisper inference *in the
visitor's browser* needs a WASM/WebGPU build instead — `whisper.cpp`'s
WASM build, or Transformers.js (ONNX Runtime Web, has a WebGPU backend in
Chrome/Edge). That's a second, separate transcription path alongside — or
instead of — the current server-side one, not a toggle on the existing
engine.

What that actually costs:

- **Model download tax**: the browser has to download the model itself
  (hundreds of MB to a few GB) before transcribing anything — needs
  caching (Cache API/IndexedDB) to not repeat every session, and even
  then it's a rough first-run experience.
- **Quality ceiling drops**: tiny/base/small run fine in-browser;
  medium/large-v3 (this app's current default on decent hardware) get
  slow or impractical outside a high-end desktop with WebGPU.
- **Diarization doesn't come along for free**: pyannote.audio is a
  PyTorch model with no mature in-browser equivalent — that piece would
  likely stay server-side even if transcription moves client-side. So
  this becomes a hybrid architecture, not a clean split.
- **Device variance becomes the support burden**: a phone and a gaming
  desktop get wildly different experiences, vs. today where everyone
  gets the same server-controlled result.

Where a cheap VPS genuinely does work well in this model: serving the
static frontend + a thin API for whatever *has* to stay server-side
(billing, Gemini proxying, maybe diarization). That's a legitimate,
common pattern — "cheap VPS" and "no server compute for transcription"
are two separate wins, and only the first is free; the second requires
the WASM engine work above.

## 2. Selling tokens for cloud processing (deferred)

The biggest lift of the three — turns a stateless local tool into a real
SaaS with money moving through it.

- **Accounts and a database, from zero.** No auth, no persistence, no
  concept of "a user" exists server-side today. Selling tokens means
  tracking who has how many — real user accounts and a ledger (Postgres,
  most likely), not an add-on.
- **Billing**: Stripe Checkout + webhooks is the standard path. Worth
  knowing for an EU-based operator: a merchant-of-record (Paddle, Lemon
  Squeezy) handles EU digital-goods VAT automatically for a larger cut,
  vs. raw Stripe where VAT compliance is on you (Stripe Tax helps but
  doesn't eliminate the work). Decide this before building checkout.
- **Pricing the compute is the hard part, not pricing Gemini.** Gemini
  tokens are pass-through pricing plus a markup — easy. Transcription
  compute is the real unknown: always-on GPU VPS (flat monthly cost,
  wasted at low volume, no cold starts) vs. serverless/pay-per-second GPU
  (Modal, RunPod Serverless, Baseten, fal.ai — pay only while
  transcribing, but eat 10-60s cold-start latency loading the model
  unless paying extra to keep it warm). Need real $/minute-of-audio
  numbers on whichever is picked before setting a token price — the same
  way AssemblyAI/Deepgram price per minute.
- **Abuse becomes a real financial risk** once real money is on the
  line per request — rate limits, file-size/duration caps, fraud
  handling all become necessary in a way they aren't for a self-hosted
  tool.
- **Real tension with the brand, flag this hardest**: "audio never
  leaves your machine" is core to Cassiodorus's positioning (see
  `BRAND.md`). A paid cloud tier needs to be an unmistakably separate,
  opt-in mode, or the free tier's privacy claim quietly stops being fully
  true. Decide the messaging before writing code, not after.

### How #1 and #2 relate

They're really the same fork in the road: a genuinely local/private free
tool (cheap VPS, static hosting, client-side or bring-your-own-compute)
vs. a real hosted product with a paid cloud tier (accounts, billing, GPU
economics). Both legitimate, but they pull the architecture differently
enough to need a real decision on which is the actual goal before
sketching either concretely — "local-first tool people self-host" and "a
SaaS charged for" are different products wearing the same UI.

## 3. Client-side session persistence — **implemented** (2026-08-04)

Not `localStorage` for the audio itself — it's string-only and capped
around 5-10MB per origin, nowhere near enough. **IndexedDB** is the right
tool: stores Blobs natively (no base64 tax), much larger quota
(hundreds of MB to a few GB, device-dependent). Transcript text, options,
and markers are small enough that localStorage is fine for those, and
that's exactly what this app already used for the Gemini key/creativity
settings/RTF calibration.

**What's persisted**: the original selected audio blob (IndexedDB, size-capped
at 50MB — see below), transcript text (original + any edits), pause/speaker
markers, the enhanced-Markdown result if generated, and the
format/language/pause-sensitivity/speakers dropdown selections.
**Deliberately not** persisted: the engine/model dropdowns (populated
asynchronously from `/api/capabilities`; correctly sequencing a restore
against that fetch wasn't worth the complexity for a convenience
feature), and ODT results (never held client-side as bytes in the first
place — only downloaded once, server-generated — so there's nothing to
restore beyond the source audio).

**Original blob, not a re-encoded/normalized copy.** Fetching a
server-normalized WAV before the user even clicks Transcribe would mean
an extra ffmpeg round trip on every source pick, most of which are never
transcribed at all. Instead, persistence is just size-capped
(`MAX_PERSISTED_AUDIO_BYTES`, currently 50MB) — skip persisting audio
above that (the text/options side of the session still persists), so one
large video upload can't silently fill up IndexedDB. If nothing is
restorable (blob too large, or genuinely absent), the whole stale session
is dropped on load rather than showing a half-restored UI with text but
no source card.

**Cleared only by explicit action** — the "Delete" button and the
review-panel close (✕) both route through `clearSource()`, which now
confirms first ("This will permanently delete your saved session...")
whenever a session actually exists, then wipes both storage layers and
resets the transcript/enhance UI. A normal reload or closing the tab
never triggers this.

**Caveats worth knowing** (not enforced by the code, just true of the
platform): browser storage isn't guaranteed durable — under storage
pressure, browsers can evict IndexedDB unless the origin has been granted
persistent storage, which isn't guaranteed even when requested via
`navigator.storage.persist()`. Private/incognito browsing gets ephemeral
or heavily restricted storage — this degrades gracefully (silently no
session to restore) rather than erroring. It's per-browser-profile,
per-device — doesn't follow a user anywhere. None of this contradicts the
"audio never leaves your machine" privacy framing — it's a pure
browser-local cache; the server still deletes uploaded audio immediately
after processing either way, unchanged by this feature.

**Not yet verified**: this was implemented and syntax-checked
(`node --check`) but not exercised in a real browser — worth a real pass
covering: upload → transcribe → reload (confirms restore), edit the
transcript → reload (confirms edits survive), Delete with a session
present (confirms the warning fires and both storage layers actually
clear), and a large (>50MB) file (confirms it degrades to "no audio
restored" rather than erroring).
