import WaveSurfer from "/static/vendor/wavesurfer/wavesurfer.esm.js";
import RecordPlugin from "/static/vendor/wavesurfer/record.esm.js";
import RegionsPlugin from "/static/vendor/wavesurfer/regions.esm.js";

const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeToggleIconSun = document.getElementById("theme-toggle-icon-sun");
const themeToggleIconMoon = document.getElementById("theme-toggle-icon-moon");
const aboutBtn = document.getElementById("about-btn");
const aboutDialog = document.getElementById("about-dialog");
const aboutCloseBtn = document.getElementById("about-close-btn");

const fileInput = document.getElementById("file-input");
const sourceCard = document.getElementById("source-card");
const stateIdle = document.getElementById("state-idle");
const stateRecording = document.getElementById("state-recording");
const stateUploading = document.getElementById("state-uploading");
const stateReview = document.getElementById("state-review");
const dropzone = document.getElementById("dropzone");
const recordBtn = document.getElementById("record-btn");
const recordingCloseBtn = document.getElementById("recording-close-btn");
const recordStatus = document.getElementById("record-status");
const pauseBtn = document.getElementById("pause-btn");
const pauseBtnLabel = document.getElementById("pause-btn-label");
const pauseBtnIconPause = document.getElementById("pause-btn-icon-pause");
const pauseBtnIconResume = document.getElementById("pause-btn-icon-resume");
const proceedBtn = document.getElementById("proceed-btn");
const recordWaveformEl = document.getElementById("record-waveform");
const uploadProgressLabel = document.getElementById("upload-progress-label");
const uploadProgressBar = document.getElementById("upload-progress-bar");
const reviewCloseBtn = document.getElementById("review-close-btn");
const sourceSummaryText = document.getElementById("source-summary-text");
const deleteSourceBtn = document.getElementById("delete-source-btn");
const sourceWaveformEl = document.getElementById("source-waveform");
const sourcePlayBtn = document.getElementById("source-play-btn");
const sourcePlayLabel = document.getElementById("source-play-label");
const sourcePlayIconPlay = document.getElementById("source-play-icon-play");
const sourcePlayIconPause = document.getElementById("source-play-icon-pause");
const engineSelect = document.getElementById("engine-select");
const languageSelect = document.getElementById("language-select");
const formatSelect = document.getElementById("format-select");
const modelSelect = document.getElementById("model-select");
const pauseSensitivitySelect = document.getElementById("pause-sensitivity-select");
const pauseSensitivityHint = document.getElementById("pause-sensitivity-hint");
const speakersSelect = document.getElementById("speakers-select");
const speakersHint = document.getElementById("speakers-hint");
const hardwareInfo = document.getElementById("hardware-info");
const transcribeBtn = document.getElementById("transcribe-btn");
const downloadProgress = document.getElementById("download-progress");
const downloadProgressLabel = document.getElementById("download-progress-label");
const downloadProgressBar = document.getElementById("download-progress-bar");
const downloadProgressDetail = document.getElementById("download-progress-detail");
const statusEl = document.getElementById("status");
const resultSection = document.getElementById("result");
const downloadLink = document.getElementById("download-link");
const downloadLinkLabel = document.getElementById("download-link-label");
const previewEl = document.getElementById("preview");
const enhanceSection = document.getElementById("enhance-section");
const geminiApiKeyInput = document.getElementById("gemini-api-key");
const enhanceBtn = document.getElementById("enhance-btn");
const enhanceStatus = document.getElementById("enhance-status");
const enhanceResult = document.getElementById("enhance-result");
const enhancePreview = document.getElementById("enhance-preview");
const enhanceDownloads = document.getElementById("enhance-downloads");
const enhanceDownloadMd = document.getElementById("enhance-download-md");
const enhanceDownloadOdtBtn = document.getElementById("enhance-download-odt-btn");
const enhanceCopyBtn = document.getElementById("enhance-copy-btn");
const enhanceCopyLabel = document.getElementById("enhance-copy-label");
const enhanceCopyIconCopy = document.getElementById("enhance-copy-icon-copy");
const enhanceCopyIconCheck = document.getElementById("enhance-copy-icon-check");
const creativitySelect = document.getElementById("creativity-select");
const creativityDescription = document.getElementById("creativity-description");
const customStyleLabel = document.getElementById("custom-style-label");
const customStyleInput = document.getElementById("custom-style-input");
const previewHint = document.getElementById("preview-hint");
const resetPreviewBtn = document.getElementById("reset-preview-btn");

// Theme: no stored preference means "follow the OS" (prefers-color-scheme,
// handled entirely by CSS) — a stored "light"/"dark" is an explicit
// override that wins in either direction via style.css's :root[data-theme]
// rules. Read fresh from localStorage on every check rather than caching
// it in a variable, so the OS-change listener below and the click handler
// never act on a stale value.
const THEME_STORAGE_KEY = "theme";

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;

  const isDark = theme
    ? theme === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  setIconHidden(themeToggleIconSun, isDark);
  setIconHidden(themeToggleIconMoon, !isDark);
  themeToggleBtn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
}

applyTheme(getStoredTheme());

themeToggleBtn.addEventListener("click", () => {
  const current = getStoredTheme();
  const currentlyDark = current
    ? current === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const next = currentlyDark ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // localStorage unavailable — the override just won't persist across reloads.
  }
});

// Keeps the sun/moon icon honest if the OS theme changes while the page is
// open and the user hasn't picked an explicit override.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!getStoredTheme()) applyTheme(null);
});

// About/how-to-use popup: a native <dialog> rather than a hand-rolled
// modal — free focus-trapping, ESC-to-close, and top-layer stacking with
// zero extra code or dependencies.
aboutBtn.addEventListener("click", () => aboutDialog.showModal());
aboutCloseBtn.addEventListener("click", () => aboutDialog.close());

// Click-outside-to-close: <dialog>'s own box has no padding here, so a
// click that lands on the dialog element itself (not one of its children)
// is necessarily on the ::backdrop area outside the visible card.
aboutDialog.addEventListener("click", (event) => {
  if (event.target === aboutDialog) aboutDialog.close();
});

// --- Session persistence -------------------------------------------
//
// Survives a page reload; only cleared by an explicit "Delete"/close on
// the source card (see clearSource further down), never just by closing
// the tab. Two storage layers: IndexedDB for the audio blob (localStorage
// is string-only and capped around 5-10MB — nowhere near enough for
// audio), localStorage for everything else (transcript text, markers,
// options — all small).
//
// Deliberately persists the ORIGINAL selected blob, not a
// server-normalized re-encode — fetching a normalized copy before the
// user even clicks Transcribe would mean an extra ffmpeg round trip on
// every source pick just to prepare a "maybe never used" cached copy.
// Instead it's just size-capped: skip persisting audio above
// MAX_PERSISTED_AUDIO_BYTES (session text/options still persist), so one
// large video upload can't silently fill up IndexedDB.
//
// Also deliberately does NOT restore the engine/model dropdowns — those
// <select> options are populated asynchronously from /api/capabilities,
// and correctly sequencing a restore against that fetch (which sets its
// own defaults once it resolves) isn't worth the complexity for what's a
// convenience feature. Format/language/pause-sensitivity/speakers are
// plain static <select> options in the HTML, so restoring those is safe.
const SESSION_DB_NAME = "cassiodorus-session";
const SESSION_DB_VERSION = 1;
const SESSION_STORE = "audio";
const SESSION_AUDIO_KEY = "current";
const SESSION_STORAGE_KEY = "cassiodorusSessionV1";
const MAX_PERSISTED_AUDIO_BYTES = 50 * 1024 * 1024;
const TEXT_FORMAT_MEDIA_TYPES = { txt: "text/plain", md: "text/markdown", srt: "application/x-subrip" };

// Set once a transcript actually comes back (live or restored) — kept
// outside the transcribe handler's own scope so persistSession() can read
// them from anywhere.
let lastIsTextualFormat = true;
let lastDownloadFilename = null;
let lastPauseMarkers = [];
let lastSpeakerTurns = [];

function openSessionDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SESSION_DB_NAME, SESSION_DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(SESSION_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSessionAudio(blob, filename, kind) {
  try {
    const db = await openSessionDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readwrite");
      tx.objectStore(SESSION_STORE).put({ blob, filename, kind }, SESSION_AUDIO_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB unavailable/blocked (private browsing, quota) — the text
    // side of the session still persists via localStorage, just without
    // restorable audio.
  }
}

async function loadSessionAudio() {
  try {
    const db = await openSessionDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readonly");
      const req = tx.objectStore(SESSION_STORE).get(SESSION_AUDIO_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

async function clearSessionAudio() {
  try {
    const db = await openSessionDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readwrite");
      tx.objectStore(SESSION_STORE).delete(SESSION_AUDIO_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // best-effort — nothing more to do if IndexedDB itself is unavailable.
  }
}

function loadSessionState() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

function clearSessionState() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Rebuilds the full session snapshot from current live state and writes
// it out. Called after anything worth surviving a reload changes — a new
// source picked, a transcript comes back, an edit is made, an
// AI-formatted version is generated.
function persistSession() {
  if (!selectedSource) return;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      filename: selectedSource.filename,
      kind: selectedSource.kind,
      durationSec: selectedSource.durationSec ?? null,
      audioSkipped: Boolean(selectedSource.audioSkipped),
      options: {
        language: languageSelect.value,
        format: formatSelect.value,
        pauseSensitivity: pauseSensitivitySelect.value,
        speakers: speakersSelect.value,
      },
      hasTranscription,
      isTextualFormat: lastIsTextualFormat,
      downloadFilename: lastDownloadFilename,
      originalTranscriptText,
      currentTranscriptText: hasTranscription ? previewEl.value : null,
      pauseMarkers: lastPauseMarkers,
      speakerTurns: lastSpeakerTurns,
      enhancedMarkdown: lastEnhancedMarkdown,
    }));
  } catch {
    // localStorage unavailable/full — session just won't survive a reload.
  }
}

// Called once, right after a brand-new source is picked (upload or
// recording) — separate from persistSession() because this is the one
// point an (async, possibly skipped) IndexedDB write is actually needed.
async function persistNewSource(blob, filename) {
  if (blob.size > MAX_PERSISTED_AUDIO_BYTES) {
    selectedSource.audioSkipped = true;
    await clearSessionAudio(); // drop any stale previous audio so a later restore can't show the wrong file
  } else {
    selectedSource.audioSkipped = false;
    await saveSessionAudio(blob, filename, selectedSource.kind);
  }
  persistSession();
}

async function restoreSession() {
  const session = loadSessionState();
  if (!session) return;

  if (session.options) {
    if (session.options.language !== undefined) languageSelect.value = session.options.language;
    if (session.options.format) formatSelect.value = session.options.format;
    if (session.options.pauseSensitivity) pauseSensitivitySelect.value = session.options.pauseSensitivity;
    if (session.options.speakers) speakersSelect.value = session.options.speakers;
    updatePauseSensitivityHint();
    updateSpeakersHint();
  }

  const audioRecord = session.audioSkipped ? null : await loadSessionAudio();
  if (!audioRecord) {
    // Nothing to actually show without the blob (no waveform/playback
    // possible) — rather than a half-restored UI with text but no source
    // card, just drop the stale session. Large (audioSkipped) files are
    // the main case this hits.
    clearSessionState();
    return;
  }

  setSource(audioRecord.kind || "file", audioRecord.blob, audioRecord.filename || session.filename || "audio");
  selectedSource.durationSec = session.durationSec ?? null;
  selectedSource.audioSkipped = false;

  // ODT results were never kept client-side as bytes (only downloaded
  // once, server-generated) — nothing meaningful to restore for that case
  // beyond the source audio above.
  if (session.hasTranscription && session.isTextualFormat) {
    hasTranscription = true;
    lastIsTextualFormat = true;
    lastDownloadFilename = session.downloadFilename || "transcript.txt";
    lastPauseMarkers = session.pauseMarkers || [];
    lastSpeakerTurns = session.speakerTurns || [];
    originalTranscriptText = session.originalTranscriptText ?? null;
    previewEl.value = session.currentTranscriptText ?? originalTranscriptText ?? "";
    previewEl.readOnly = false;
    previewHint.hidden = false;
    resultSection.hidden = false;
    statusEl.textContent = "Restored from your last session.";
    enhanceSection.hidden = false;

    if (session.currentTranscriptText != null) {
      const mediaType = TEXT_FORMAT_MEDIA_TYPES[session.options?.format] || "text/plain";
      const blob = new Blob([session.currentTranscriptText], { type: mediaType });
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = lastDownloadFilename;
      downloadLinkLabel.textContent = `Download ${lastDownloadFilename}`;
    }

    if (session.enhancedMarkdown) {
      lastEnhancedMarkdown = session.enhancedMarkdown;
      enhancePreview.textContent = lastEnhancedMarkdown;
      enhanceResult.hidden = false;
      enhanceDownloads.hidden = false;
      const mdBlob = new Blob([lastEnhancedMarkdown], { type: "text/markdown" });
      enhanceDownloadMd.href = URL.createObjectURL(mdBlob);
      enhanceDownloadMd.download = "transcript-formatted.md";
    }

    // Waveform overlays need the waveform actually decoded first —
    // setSource() above kicked off an async loadBlob() that this races
    // ahead of otherwise.
    sourceWavesurfer.once("ready", () => {
      renderTranscriptOverlays(lastPauseMarkers, lastSpeakerTurns);
    });
  }
}

// Mirrors PAUSE_SENSITIVITY_SECONDS in backend/app/formats/paragraphs.py —
// keep the gap values mentioned here in sync with that dict.
const PAUSE_SENSITIVITY_HINTS = {
  short: "Breaks into a new paragraph after even a brief pause (~0.5s) — more, shorter paragraphs.",
  normal: "Breaks into a new paragraph after a natural pause (~1s) — a good default for most speech.",
  long: "Only breaks into a new paragraph after a long pause (~2s) — fewer, longer paragraphs.",
};

function updatePauseSensitivityHint() {
  pauseSensitivityHint.textContent = PAUSE_SENSITIVITY_HINTS[pauseSensitivitySelect.value] || "";
}
pauseSensitivitySelect.addEventListener("change", updatePauseSensitivityHint);
updatePauseSensitivityHint();

// Diarization is imperfect on overlapping speech/short interjections, so the
// hint sets expectations rather than promising exact results — the
// transcript preview stays editable for exactly this reason.
function updateSpeakersHint() {
  if (speakersSelect.value !== "multiple") {
    speakersHint.textContent = "";
  } else if (!diarizationAvailable) {
    speakersHint.textContent =
      "Speaker diarization isn't available on this server (needs pyannote.audio installed and HF_TOKEN set).";
  } else {
    speakersHint.textContent =
      "Detects who's speaking and labels each paragraph — imperfect on overlapping speech, edit the transcript to fix misattributed lines.";
  }
}
speakersSelect.addEventListener("change", updateSpeakersHint);
updateSpeakersHint();

function setBusyStatus(el, text) {
  el.innerHTML = "";
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  el.appendChild(spinner);
  el.appendChild(document.createTextNode(text));
}

// h:mm:ss once past an hour, m:ss otherwise — plain "NNNs" stops being
// readable a couple minutes into a long transcription.
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Transcription has no real progress signal (see the timer comment below),
// so an ETA has to come from a throughput estimate: seconds of processing
// per second of audio ("RTF"), applied to this file's known duration.
// Seeded with rough guesses per model/hardware tier, then replaced by an
// exponential moving average of this machine's own observed runs (stored
// per engine+model in localStorage) — the seed only matters for the very
// first transcription of a given engine/model combo.
const RTF_STORAGE_KEY = "sttRtfHistoryV1";
const DEFAULT_RTF = {
  gpu: { tiny: 0.05, base: 0.08, small: 0.15, medium: 0.3, "large-v3": 0.5 },
  cpu: { tiny: 0.3, base: 0.5, small: 1.0, medium: 2.5, "large-v3": 5.0 },
};

function loadRtfHistory() {
  try {
    return JSON.parse(localStorage.getItem(RTF_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

// Diarization runs a second model (pyannote) over the whole clip on top of
// transcription, which the base RTF table knows nothing about — without
// this, "Multiple speakers" runs looked exactly as fast as "Single speaker"
// in the estimate and the ETA blew past almost immediately. Only applied to
// the uncalibrated seed guess; once a real multi-speaker run has completed,
// its own tracked history (see rtfKey below) reflects the true end-to-end
// time and this surcharge no longer matters.
const DIARIZATION_RTF_SURCHARGE = 1.0;

// Keeps "Multiple speakers" runs in their own calibration bucket rather than
// polluting (or being underestimated by) plain transcription's history —
// diarization adds real time on top, so the two shouldn't share one average.
// Single-speaker keeps the original unsuffixed key so existing calibration
// data already in users' localStorage keeps working.
function rtfKey(engine, model, speakers) {
  return speakers === "multiple" ? `${engine}:${model}:multiple` : `${engine}:${model}`;
}

function estimateRtf(engine, model, gpuActive, speakers) {
  const history = loadRtfHistory();
  const key = rtfKey(engine, model, speakers);
  if (history[key]) return { rtf: history[key], calibrated: true };
  const table = gpuActive ? DEFAULT_RTF.gpu : DEFAULT_RTF.cpu;
  const fallback = gpuActive ? 0.3 : 2.0;
  const baseRtf = table[model] ?? fallback;
  const rtf = speakers === "multiple" ? baseRtf + DIARIZATION_RTF_SURCHARGE : baseRtf;
  return { rtf, calibrated: false };
}

function recordRtf(engine, model, speakers, rtf) {
  if (!Number.isFinite(rtf) || rtf <= 0) return;
  const history = loadRtfHistory();
  const key = rtfKey(engine, model, speakers);
  history[key] = history[key] ? history[key] * 0.7 + rtf * 0.3 : rtf;
  try {
    localStorage.setItem(RTF_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage unavailable (private browsing, quota) — estimates just won't persist across sessions.
  }
}

// Wavesurfer's waveColor/progressColor options need a literal color, not a
// CSS custom property reference — a canvas fillStyle can't resolve var(...)
// itself, so this resolves it once against the current theme at instantiation.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let recordWavesurfer = null; // wavesurfer instance backing the live recording waveform, created per recording session
let recordPlugin = null; // its RecordPlugin, drives mic capture + pause/resume + record-progress
let discardRecording = false; // set right before stopRecording() when the close (X) button, not Proceed, ended the session
let sourceWavesurfer = null; // wavesurfer instance backing the playback waveform for whatever selectedSource currently is
let sourceRegions = null; // its RegionsPlugin, used to drop pause markers once a transcript comes back
let selectedSource = null; // { blob, filename }
let engineLanguageSupport = {}; // engine name -> list of supported codes, or null for unrestricted
let gpuActive = false; // caps.hardware.gpu_usable, used to seed transcription time estimates
let diarizationAvailable = false; // caps.diarization.available
let autoDefaultModel = null; // the concrete model size "auto" currently resolves to, per /api/capabilities

// The source card is a single element showing one of these four states at a
// time — idle (drop/record entry point), recording (live waveform), a brief
// uploading step (real FileReader byte progress), and review (playback +
// transcribe/delete) shared by both the upload and record paths.
const cardStates = { idle: stateIdle, recording: stateRecording, uploading: stateUploading, review: stateReview };
function setCardState(state) {
  for (const [name, el] of Object.entries(cardStates)) {
    el.hidden = name !== state;
  }
  sourceCard.classList.toggle("card-idle", state === "idle");
}
let hasTranscription = false; // whether a transcription has completed (gates the enhance button)
let lastEnhancedMarkdown = null;
let originalTranscriptText = null; // pristine transcribed text, for the "reset to original" button

resetPreviewBtn.addEventListener("click", () => {
  if (originalTranscriptText != null) previewEl.value = originalTranscriptText;
  persistSession();
});

// Debounced so persistSession() (a synchronous JSON.stringify + localStorage
// write) doesn't run on every keystroke while editing the transcript.
let previewSaveTimer = null;
previewEl.addEventListener("input", () => {
  if (!hasTranscription) return;
  clearTimeout(previewSaveTimer);
  previewSaveTimer = setTimeout(persistSession, 600);
});

const savedGeminiKey = localStorage.getItem("gemini_api_key");
if (savedGeminiKey) geminiApiKeyInput.value = savedGeminiKey;
geminiApiKeyInput.addEventListener("input", () => {
  localStorage.setItem("gemini_api_key", geminiApiKeyInput.value);
});

const savedCustomStyle = localStorage.getItem("gemini_custom_style");
if (savedCustomStyle) customStyleInput.value = savedCustomStyle;

let creativityDescriptions = {}; // value -> description text

function updateCreativityInfo() {
  creativityDescription.textContent = creativityDescriptions[creativitySelect.value] || "";
  customStyleLabel.hidden = creativitySelect.value !== "custom";
}

creativitySelect.addEventListener("change", () => {
  localStorage.setItem("gemini_creativity", creativitySelect.value);
  updateCreativityInfo();
});
customStyleInput.addEventListener("input", () => {
  localStorage.setItem("gemini_custom_style", customStyleInput.value);
});

fetch("/api/enhance/options")
  .then((res) => res.json())
  .then((opts) => {
    creativitySelect.innerHTML = "";
    for (const [value, preset] of Object.entries(opts.presets)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = preset.label;
      creativitySelect.appendChild(option);
      creativityDescriptions[value] = preset.description;
    }
    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "Custom — write your own style/tone prompt";
    creativitySelect.appendChild(customOption);
    creativityDescriptions.custom = opts.custom_description;

    const savedCreativity = localStorage.getItem("gemini_creativity");
    if (savedCreativity && creativityDescriptions[savedCreativity] !== undefined) {
      creativitySelect.value = savedCreativity;
    }
    updateCreativityInfo();
  })
  .catch(() => {
    updateCreativityInfo();
  });

function updateLanguageAvailability() {
  const supported = engineLanguageSupport[engineSelect.value];
  for (const opt of languageSelect.options) {
    const isAutoDetect = opt.value === "";
    opt.disabled = Boolean(supported) && !isAutoDetect && !supported.includes(opt.value);
  }
  if (languageSelect.selectedOptions[0]?.disabled) {
    const firstEnabled = [...languageSelect.options].find((o) => !o.disabled);
    if (firstEnabled) languageSelect.value = firstEnabled.value;
  }
}

function updateModelAvailability() {
  modelSelect.disabled = engineSelect.value !== "faster-whisper";
}

engineSelect.addEventListener("change", () => {
  updateLanguageAvailability();
  updateModelAvailability();
});

fetch("/api/capabilities")
  .then((res) => res.json())
  .then((caps) => {
    const auto = caps.auto_default;
    autoDefaultModel = auto.model;
    modelSelect.innerHTML = "";

    const autoOption = document.createElement("option");
    autoOption.value = "auto";
    autoOption.textContent = `Auto — ${auto.model} (recommended)`;
    modelSelect.appendChild(autoOption);

    for (const size of caps.available_models) {
      const opt = document.createElement("option");
      opt.value = size;
      opt.textContent = size;
      modelSelect.appendChild(opt);
    }
    modelSelect.value = "auto";

    engineSelect.innerHTML = "";
    for (const [name, info] of Object.entries(caps.engines)) {
      if (!info.available) continue;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name === "parakeet" ? `parakeet (${info.model})` : name;
      engineSelect.appendChild(opt);
      engineLanguageSupport[name] = info.supported_languages;
    }
    engineSelect.value = "faster-whisper";
    updateLanguageAvailability();
    updateModelAvailability();

    diarizationAvailable = Boolean(caps.diarization?.available);
    const multipleSpeakersOption = [...speakersSelect.options].find((o) => o.value === "multiple");
    if (multipleSpeakersOption) multipleSpeakersOption.disabled = !diarizationAvailable;
    updateSpeakersHint();

    gpuActive = caps.hardware.gpu_usable;
    if (caps.hardware.gpu_usable) {
      hardwareInfo.textContent = `Detected: ${caps.hardware.gpu_name} (${(caps.hardware.vram_mb / 1024).toFixed(1)} GB VRAM) — GPU acceleration active.`;
    } else if (caps.hardware.gpu_present) {
      hardwareInfo.textContent = `Detected: ${caps.hardware.gpu_name}, but it failed a GPU inference test (missing CUDA libraries?) — falling back to CPU.`;
    } else {
      hardwareInfo.textContent = `Detected: CPU only (${caps.hardware.cpu_count} cores, ${(caps.hardware.ram_mb / 1024).toFixed(1)} GB RAM).`;
    }
  })
  .catch(() => {
    hardwareInfo.textContent = "Could not detect hardware capabilities.";
  });

function extensionFromMimeType(mimeType) {
  if (mimeType && mimeType.includes("ogg")) return "ogg";
  if (mimeType && mimeType.includes("mp4")) return "mp4";
  if (mimeType && mimeType.includes("wav")) return "wav";
  return "webm";
}

// The `hidden` IDL property doesn't reflect onto the `hidden` content
// attribute for inline <svg> elements the way it does for HTML elements —
// setting `svgEl.hidden = true` silently no-ops, leaving the icon visible.
// Toggling the attribute directly works for both.
function setIconHidden(el, hidden) {
  if (hidden) el.setAttribute("hidden", "");
  else el.removeAttribute("hidden");
}

function setSourcePlayState(isPlaying) {
  sourcePlayLabel.textContent = isPlaying ? "Pause" : "Play";
  setIconHidden(sourcePlayIconPlay, isPlaying);
  setIconHidden(sourcePlayIconPause, !isPlaying);
}

function teardownSourceWavesurfer() {
  if (sourceWavesurfer) {
    sourceWavesurfer.destroy();
    sourceWavesurfer = null;
  }
  sourceRegions = null;
}

// Cycled through in first-seen order (matches diarize_and_label's "Speaker
// 1, Speaker 2, ..." numbering on the backend) so each speaker gets a
// consistent, distinct color across the waveform overlay.
const SPEAKER_OVERLAY_COLORS = [
  "rgba(58, 92, 204, 0.25)", // accent blue
  "rgba(16, 163, 74, 0.25)", // green
  "rgba(217, 119, 6, 0.25)", // amber
  "rgba(219, 39, 119, 0.25)", // pink
  "rgba(124, 58, 237, 0.25)", // violet
  "rgba(8, 145, 178, 0.25)", // cyan
];

function colorForSpeaker(speaker, speakerColorMap) {
  if (!(speaker in speakerColorMap)) {
    const index = Object.keys(speakerColorMap).length % SPEAKER_OVERLAY_COLORS.length;
    speakerColorMap[speaker] = SPEAKER_OVERLAY_COLORS[index];
  }
  return speakerColorMap[speaker];
}

// Draws both the per-speaker overlay bands (wide, translucent, one per
// diarized turn — click one to play just that stretch) and the pause-based
// paragraph markers (thin lines) on top, matching what the transcript
// preview shows as speaker labels / blank lines respectively.
function renderTranscriptOverlays(pauseMarkers, speakerTurns) {
  if (!sourceRegions) return;
  sourceRegions.clearRegions();

  const speakerColorMap = {};
  for (const turn of speakerTurns) {
    sourceRegions.addRegion({
      start: turn.start,
      end: turn.end,
      color: colorForSpeaker(turn.speaker, speakerColorMap),
      content: turn.speaker,
      drag: false,
      resize: false,
    });
  }

  for (const t of pauseMarkers) {
    sourceRegions.addRegion({
      start: t,
      color: cssVar("--danger"),
      drag: false,
      resize: false,
    });
  }
}

function loadSourcePreview(blob) {
  teardownSourceWavesurfer();
  sourceRegions = RegionsPlugin.create();
  sourceWavesurfer = WaveSurfer.create({
    container: sourceWaveformEl,
    waveColor: cssVar("--border"),
    progressColor: cssVar("--accent"),
    height: 48,
    barWidth: 2,
    cursorWidth: 0,
    plugins: [sourceRegions],
  });
  // Click a speaker/pause region to jump to and play that stretch of
  // audio — a natural way to check a diarization call by ear.
  sourceRegions.on("region-clicked", (region, event) => {
    event.stopPropagation();
    region.play();
  });
  sourceWavesurfer.loadBlob(blob);
  setSourcePlayState(false);
  sourceWavesurfer.on("play", () => setSourcePlayState(true));
  sourceWavesurfer.on("pause", () => setSourcePlayState(false));
  sourceWavesurfer.on("finish", () => setSourcePlayState(false));
  // Feeds the transcription-time estimate — captured here (once decoding
  // finishes) rather than trusted from the source, since recorded blobs
  // don't carry a reliable duration any other way.
  sourceWavesurfer.on("ready", () => {
    if (selectedSource) selectedSource.durationSec = sourceWavesurfer.getDuration();
  });
}

sourcePlayBtn.addEventListener("click", () => {
  if (sourceWavesurfer) sourceWavesurfer.playPause();
});

function setSource(kind, blob, filename) {
  selectedSource = { blob, filename, kind };
  sourceSummaryText.textContent =
    kind === "file" ? `Selected file: ${filename}` : `Recorded audio ready: ${filename}`;
  // Unhide the review panel before creating the wavesurfer instance — its
  // container needs real (non-zero) layout dimensions at creation time.
  setCardState("review");
  loadSourcePreview(blob);
}

function clearSource() {
  // Only the delete/close actions on the review card (where a session may
  // already be persisted) route through here — warn before destroying it,
  // since there's no undo once IndexedDB/localStorage are cleared.
  if (loadSessionState()) {
    const confirmed = window.confirm(
      "This will permanently delete your saved session (audio, transcript, and any edits). Continue?"
    );
    if (!confirmed) return;
  }
  clearSessionState();
  clearSessionAudio();

  selectedSource = null;
  fileInput.value = "";
  teardownSourceWavesurfer();
  setCardState("idle");

  hasTranscription = false;
  originalTranscriptText = null;
  lastEnhancedMarkdown = null;
  lastPauseMarkers = [];
  lastSpeakerTurns = [];
  resultSection.hidden = true;
  enhanceSection.hidden = true;
  statusEl.textContent = "";
}

deleteSourceBtn.addEventListener("click", clearSource);
reviewCloseBtn.addEventListener("click", clearSource);

// Click-to-browse anywhere in the dropzone, except the mic button (which has
// its own action) — its click would otherwise bubble up and fire both.
dropzone.addEventListener("click", (event) => {
  if (event.target.closest("#record-btn")) return;
  fileInput.click();
});

for (const evt of ["dragenter", "dragover"]) {
  dropzone.addEventListener(evt, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
}
for (const evt of ["dragleave", "dragend"]) {
  dropzone.addEventListener(evt, () => dropzone.classList.remove("dragover"));
}
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const file = event.dataTransfer.files[0];
  if (file) handleFileSelected(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) handleFileSelected(file);
});

// Reads the whole file via FileReader purely to drive a real byte-progress
// bar (the actual data path still uses the original File/Blob afterward) —
// genuine progress for large video files, near-instant (and honestly so)
// for typical small audio clips.
function readFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    reader.onload = () => resolve();
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

async function handleFileSelected(file) {
  setCardState("uploading");
  uploadProgressBar.value = 0;
  uploadProgressLabel.textContent = `Loading ${file.name}…`;
  try {
    await readFileWithProgress(file, (percent) => {
      uploadProgressBar.value = percent;
      uploadProgressLabel.textContent = `Loading ${file.name}… ${percent}%`;
    });
  } catch (err) {
    statusEl.textContent = `Failed to read file: ${err.message}`;
    setCardState("idle");
    return;
  }
  setSource("file", file, file.name);
  persistNewSource(file, file.name);
}

function resetPauseButton() {
  pauseBtnLabel.textContent = "Pause";
  setIconHidden(pauseBtnIconPause, false);
  setIconHidden(pauseBtnIconResume, true);
}

function teardownRecordWavesurfer() {
  if (recordWavesurfer) {
    const instance = recordWavesurfer;
    recordWavesurfer = null;
    recordPlugin = null;
    // RecordPlugin has its own "record-end" listener (registered before ours)
    // that tears down its mic AudioContext. Destroying synchronously in the
    // same tick raced with that internal cleanup and threw "Cannot close a
    // closed AudioContext" — deferring one tick lets it finish first.
    setTimeout(() => instance.destroy(), 0);
  }
}

recordBtn.addEventListener("click", async () => {
  try {
    // Unhide the recording panel before creating the wavesurfer instance —
    // its container needs real (non-zero) layout dimensions at creation time.
    setCardState("recording");
    recordWavesurfer = WaveSurfer.create({
      container: recordWaveformEl,
      waveColor: cssVar("--accent"),
      height: 60,
      barWidth: 2,
    });
    recordPlugin = recordWavesurfer.registerPlugin(
      RecordPlugin.create({ scrollingWaveform: true, renderRecordedAudio: false })
    );

    let lastRecordMs = 0;
    function renderRecordStatus(paused) {
      const elapsed = Math.floor(lastRecordMs / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      recordStatus.textContent = `${paused ? "Paused" : "Recording…"} ${mm}:${ss}`;
    }

    // record-progress stops firing entirely while paused (the plugin's own
    // timer is stopped), so record-pause/record-resume also have to call
    // this directly — otherwise the status text would freeze on whatever it
    // last said ("Recording…") instead of flipping to "Paused".
    recordPlugin.on("record-progress", (ms) => {
      lastRecordMs = ms;
      renderRecordStatus(false);
    });
    recordPlugin.on("record-pause", () => {
      renderRecordStatus(true);
      pauseBtnLabel.textContent = "Resume";
      setIconHidden(pauseBtnIconPause, true);
      setIconHidden(pauseBtnIconResume, false);
    });
    recordPlugin.on("record-resume", () => {
      renderRecordStatus(false);
      pauseBtnLabel.textContent = "Pause";
      setIconHidden(pauseBtnIconPause, false);
      setIconHidden(pauseBtnIconResume, true);
    });
    recordPlugin.on("record-end", (blob) => {
      const wasDiscard = discardRecording;
      discardRecording = false;
      teardownRecordWavesurfer();
      resetPauseButton();
      recordStatus.textContent = "";
      if (wasDiscard) {
        setCardState("idle");
      } else {
        const filename = `recording.${extensionFromMimeType(blob.type)}`;
        setSource("recording", blob, filename);
        persistNewSource(blob, filename);
      }
    });

    await recordPlugin.startRecording();
  } catch (err) {
    statusEl.textContent = `Microphone access failed: ${err.message}`;
    teardownRecordWavesurfer();
    setCardState("idle");
  }
});

recordingCloseBtn.addEventListener("click", () => {
  if (!recordPlugin) return;
  discardRecording = true;
  recordPlugin.stopRecording();
});

proceedBtn.addEventListener("click", () => {
  if (!recordPlugin) return;
  discardRecording = false;
  recordPlugin.stopRecording();
});

pauseBtn.addEventListener("click", () => {
  if (!recordPlugin) return;
  if (recordPlugin.isRecording()) recordPlugin.pauseRecording();
  else if (recordPlugin.isPaused()) recordPlugin.resumeRecording();
});

function parseFilename(contentDisposition) {
  const match = /filename="?([^"]+)"?/.exec(contentDisposition || "");
  return match ? match[1] : "transcript.txt";
}

// Only covers the faster-whisper engine — Parakeet's download mechanism
// (NeMo/NGC) isn't wired up here, so selecting it just goes straight to
// "Transcribing…" with no progress bar, same as before this existed.
async function ensureModelReady(modelSize) {
  let res;
  try {
    const fd = new FormData();
    fd.append("model", modelSize);
    res = await fetch("/api/models/warmup", { method: "POST", body: fd });
  } catch (err) {
    return { ready: true }; // can't reach the endpoint; let /api/transcribe surface the real error
  }
  if (!res.ok) return { ready: true };

  let data = await res.json().catch(() => null);
  if (!data || data.status === "ready") return { ready: true };
  if (data.status === "error") {
    return { ready: false, message: `Failed to download model "${data.model}": ${data.message}` };
  }

  downloadProgress.hidden = false;
  downloadProgressLabel.textContent = `Downloading model "${data.model}"…`;

  let lastMb = null;
  let lastTime = Date.now();
  const startTime = Date.now();
  const maxPolls = 3600; // ~1 hour safety cap at 1s/poll

  // Hugging Face's newer "Xet" transfer backend downloads in parallel
  // chunks rather than one smooth stream — on-disk size can sit flat for
  // 20-30s during transfer setup, then jump in bursts. A percent-only bar
  // would look frozen during that window, so an elapsed-time counter that
  // always ticks (independent of byte progress) runs alongside it —
  // that's the actual "don't look frozen" signal; the percent/MB numbers
  // are a bonus once Xet actually starts flushing data to disk.
  for (let i = 0; i < maxPolls && data.status !== "ready"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let statusRes;
    try {
      statusRes = await fetch(`/api/models/status?model=${encodeURIComponent(modelSize)}`);
    } catch (err) {
      continue;
    }
    if (!statusRes.ok) continue;
    data = await statusRes.json().catch(() => data);

    if (data.status === "error") {
      downloadProgressBar.removeAttribute("value");
      const message = `Failed to download model "${data.model}": ${data.message}`;
      downloadProgressLabel.textContent = message;
      downloadProgressDetail.textContent = "";
      return { ready: false, message };
    }

    if (data.status === "interrupted") {
      downloadProgressBar.removeAttribute("value");
      const partialText = data.downloaded_mb != null ? ` (${data.downloaded_mb} / ${data.total_mb} MB cached)` : "";
      const message = `Download of "${data.model}" was interrupted${partialText}. Try transcribing again to resume.`;
      downloadProgressLabel.textContent = message;
      downloadProgressDetail.textContent = "";
      return { ready: false, message };
    }

    const now = Date.now();
    const elapsedSec = (now - startTime) / 1000;
    let speedText = "";
    if (data.downloaded_mb != null && lastMb != null) {
      const deltaMb = data.downloaded_mb - lastMb;
      const deltaSec = (now - lastTime) / 1000;
      if (deltaSec > 0 && deltaMb >= 0) speedText = ` (${(deltaMb / deltaSec).toFixed(1)} MB/s)`;
    }
    if (data.downloaded_mb != null) {
      lastMb = data.downloaded_mb;
      lastTime = now;
    }

    if (data.percent != null) {
      downloadProgressBar.value = data.percent;
      downloadProgressDetail.textContent = `${data.percent}% — ${data.downloaded_mb} / ${data.total_mb} MB${speedText} — ${formatDuration(elapsedSec)} elapsed`;
    } else {
      downloadProgressBar.removeAttribute("value");
      const byteText = data.downloaded_mb != null ? `${data.downloaded_mb} MB downloaded so far` : "Preparing download";
      downloadProgressDetail.textContent = `${byteText}${speedText} — ${formatDuration(elapsedSec)} elapsed`;
    }
  }

  downloadProgress.hidden = true;
  if (data.status !== "ready") {
    return { ready: false, message: `Model "${data.model}" is still downloading. Try transcribing again shortly.` };
  }
  return { ready: true };
}

transcribeBtn.addEventListener("click", async () => {
  if (!selectedSource) return;

  transcribeBtn.disabled = true;
  statusEl.textContent = "";
  resultSection.hidden = true;

  if (engineSelect.value === "faster-whisper") {
    setBusyStatus(statusEl, "Checking model availability…");
    const modelReady = await ensureModelReady(modelSelect.value);
    if (!modelReady.ready) {
      statusEl.textContent = modelReady.message;
      transcribeBtn.disabled = false;
      return;
    }
  }

  const formData = new FormData();
  formData.append("file", selectedSource.blob, selectedSource.filename);
  if (languageSelect.value) formData.append("language", languageSelect.value);
  const isTextualFormat = formatSelect.value !== "odt";
  formData.append("output_format", formatSelect.value);
  formData.append("engine", engineSelect.value);
  formData.append("pause_sensitivity", pauseSensitivitySelect.value);
  formData.append("speakers", speakersSelect.value);
  if (engineSelect.value === "faster-whisper") {
    formData.append("model", modelSelect.value);
  }

  // No real progress signal available from a single blocking /api/transcribe
  // call, so this is an honest elapsed-time indicator (proves it's alive)
  // rather than a fake percentage — same reasoning as the model-download
  // progress bar's elapsed counter. The remaining-time figure alongside it
  // is a genuine estimate (see estimateRtf above), not a guess dressed up
  // as one — always labeled "estimated" since it's necessarily rough,
  // especially before this engine/model has run on this machine before.
  const transcribeEngine = engineSelect.value;
  const transcribeModel = transcribeEngine === "faster-whisper"
    ? (modelSelect.value === "auto" ? autoDefaultModel : modelSelect.value)
    : null;
  const durationSec = selectedSource.durationSec ?? null;
  const { rtf: estimatedRtf, calibrated } = transcribeModel
    ? estimateRtf(transcribeEngine, transcribeModel, gpuActive, speakersSelect.value)
    : { rtf: null, calibrated: false };
  const estimatedTotalSec = durationSec != null && estimatedRtf != null ? durationSec * estimatedRtf : null;

  const transcribeStart = Date.now();
  const transcribeTimer = setInterval(() => {
    const elapsedSec = (Date.now() - transcribeStart) / 1000;
    let text = `Transcribing… ${formatDuration(elapsedSec)} elapsed`;
    if (estimatedTotalSec != null) {
      const remainingSec = estimatedTotalSec - elapsedSec;
      text += remainingSec > 0
        ? ` (~${formatDuration(remainingSec)} remaining, estimated${calibrated ? "" : " — first run for this model"})`
        : " (almost done — running longer than estimated)";
    }
    setBusyStatus(statusEl, text);
  }, 500);
  setBusyStatus(statusEl, "Transcribing… 0:00 elapsed");

  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: formData });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `Request failed (${res.status})`);
    }

    const blob = await res.blob();
    const filename = parseFilename(res.headers.get("Content-Disposition"));

    const pauseMarkersHeader = res.headers.get("X-Pause-Markers");
    const speakerSegmentsHeader = res.headers.get("X-Speaker-Segments");
    let pauseMarkers = [];
    let speakerTurns = [];
    try {
      if (pauseMarkersHeader) pauseMarkers = JSON.parse(pauseMarkersHeader);
      if (speakerSegmentsHeader) speakerTurns = JSON.parse(speakerSegmentsHeader);
    } catch {
      // non-fatal — the transcript itself still came through fine
    }
    renderTranscriptOverlays(pauseMarkers, speakerTurns);

    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLinkLabel.textContent = `Download ${filename}`;

    if (isTextualFormat) {
      originalTranscriptText = await blob.text();
      previewEl.value = originalTranscriptText;
      previewEl.readOnly = false;
      previewHint.hidden = false;
    } else {
      originalTranscriptText = null;
      previewEl.value = "(binary file — use the download link above)";
      previewEl.readOnly = true;
      previewHint.hidden = true;
    }

    resultSection.hidden = false;
    statusEl.textContent = "Done.";
    hasTranscription = true;
    if (transcribeModel && durationSec) {
      const actualElapsedSec = (Date.now() - transcribeStart) / 1000;
      recordRtf(transcribeEngine, transcribeModel, speakersSelect.value, actualElapsedSec / durationSec);
    }
    // AI formatting needs editable text to work from — odt (binary)
    // output has none, so the section stays hidden in that case rather
    // than silently re-fetching a separate plain-text copy behind the
    // scenes (which is exactly the duplication this replaced).
    enhanceSection.hidden = !isTextualFormat;
    enhanceResult.hidden = true;
    enhanceStatus.textContent = "";
    lastEnhancedMarkdown = null;

    lastIsTextualFormat = isTextualFormat;
    lastDownloadFilename = filename;
    lastPauseMarkers = pauseMarkers;
    lastSpeakerTurns = speakerTurns;
    persistSession();
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    clearInterval(transcribeTimer);
    transcribeBtn.disabled = false;
  }
});

// Consumes the SSE stream from /api/enhance/stream, calling onChunk with
// the accumulated text so far as each chunk arrives — real progressive
// output (Gemini is actually generating this live), not a fake indicator.
// fetch()'s ReadableStream is used directly rather than EventSource,
// since EventSource only supports GET and this needs to POST form data.
async function streamEnhance(formData, onChunk) {
  const res = await fetch("/api/enhance/stream", { method: "POST", body: formData });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || `Formatting failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);
      if (!rawEvent.startsWith("data:")) continue;

      const payload = JSON.parse(rawEvent.slice("data:".length).trim());
      if (payload.error) throw new Error(payload.error);
      if (payload.chunk) {
        fullText += payload.chunk;
        onChunk(fullText);
      }
      if (payload.done) return fullText;
    }
  }
  return fullText;
}

enhanceBtn.addEventListener("click", async () => {
  if (!hasTranscription) return;

  const textToFormat = previewEl.value.trim();
  if (!textToFormat) {
    enhanceStatus.textContent = "The transcript to format is empty.";
    return;
  }
  const apiKey = geminiApiKeyInput.value.trim();
  if (!apiKey) {
    enhanceStatus.textContent = "Enter a Gemini API key first.";
    return;
  }
  if (creativitySelect.value === "custom" && !customStyleInput.value.trim()) {
    enhanceStatus.textContent = "Write a style/tone prompt for custom creativity, or pick a preset level instead.";
    return;
  }

  enhanceBtn.disabled = true;
  enhanceResult.hidden = true;
  enhancePreview.textContent = "";

  try {
    setBusyStatus(enhanceStatus, "Formatting with Gemini…");
    const fd = new FormData();
    fd.append("text", textToFormat);
    fd.append("api_key", apiKey);
    fd.append("creativity", creativitySelect.value);
    if (creativitySelect.value === "custom") {
      fd.append("custom_style", customStyleInput.value.trim());
    }

    // Show the result section immediately so the preview visibly grows as
    // text streams in — that live growth is the actual "it's working"
    // signal here, stronger than any spinner could be. The download
    // buttons stay hidden until generation actually finishes, though —
    // otherwise they'd sit there clickable (against a stale previous
    // result, or nothing at all) while the real text is still arriving.
    enhanceResult.hidden = false;
    enhanceDownloads.hidden = true;
    resetCopyButton();
    lastEnhancedMarkdown = await streamEnhance(fd, (partialText) => {
      enhancePreview.textContent = partialText;
    });

    const mdBlob = new Blob([lastEnhancedMarkdown], { type: "text/markdown" });
    enhanceDownloadMd.href = URL.createObjectURL(mdBlob);
    enhanceDownloadMd.download = "transcript-formatted.md";
    enhanceDownloads.hidden = false;

    enhanceStatus.textContent = "Done.";
    persistSession();
  } catch (err) {
    enhanceStatus.textContent = `Error: ${err.message}`;
  } finally {
    enhanceBtn.disabled = false;
  }
});

// navigator.clipboard requires a secure context (https, or localhost) — the
// hidden-textarea + execCommand fallback covers plain-http deployments where
// it's unavailable.
async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function resetCopyButton() {
  enhanceCopyLabel.textContent = "Copy";
  setIconHidden(enhanceCopyIconCopy, false);
  setIconHidden(enhanceCopyIconCheck, true);
}

enhanceCopyBtn.addEventListener("click", async () => {
  if (!lastEnhancedMarkdown) return;
  try {
    await copyTextToClipboard(lastEnhancedMarkdown);
    enhanceCopyLabel.textContent = "Copied!";
    setIconHidden(enhanceCopyIconCopy, true);
    setIconHidden(enhanceCopyIconCheck, false);
    setTimeout(resetCopyButton, 1500);
  } catch (err) {
    enhanceStatus.textContent = `Error: ${err.message}`;
  }
});

enhanceDownloadOdtBtn.addEventListener("click", async () => {
  if (!lastEnhancedMarkdown) return;

  enhanceDownloadOdtBtn.disabled = true;
  try {
    const fd = new FormData();
    fd.append("markdown", lastEnhancedMarkdown);

    const res = await fetch("/api/enhance/odt", { method: "POST", body: fd });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `ODT conversion failed (${res.status})`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript-formatted.odt";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    enhanceStatus.textContent = `Error: ${err.message}`;
  } finally {
    enhanceDownloadOdtBtn.disabled = false;
  }
});

// Deferred to the very end of the module: by this point every let/const
// this touches (sourceWavesurfer, diarizationAvailable, etc.) is fully
// initialized and every listener is wired, so there's no risk of racing
// the module's own top-to-bottom evaluation.
restoreSession();
