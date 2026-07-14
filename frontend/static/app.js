import WaveSurfer from "/static/vendor/wavesurfer/wavesurfer.esm.js";
import RecordPlugin from "/static/vendor/wavesurfer/record.esm.js";

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

function setBusyStatus(el, text) {
  el.innerHTML = "";
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  el.appendChild(spinner);
  el.appendChild(document.createTextNode(text));
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
let selectedSource = null; // { blob, filename }
let engineLanguageSupport = {}; // engine name -> list of supported codes, or null for unrestricted

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

function setSourcePlayState(isPlaying) {
  sourcePlayLabel.textContent = isPlaying ? "Pause" : "Play";
  sourcePlayIconPlay.hidden = isPlaying;
  sourcePlayIconPause.hidden = !isPlaying;
}

function teardownSourceWavesurfer() {
  if (sourceWavesurfer) {
    sourceWavesurfer.destroy();
    sourceWavesurfer = null;
  }
}

function loadSourcePreview(blob) {
  teardownSourceWavesurfer();
  sourceWavesurfer = WaveSurfer.create({
    container: sourceWaveformEl,
    waveColor: cssVar("--border"),
    progressColor: cssVar("--accent"),
    height: 48,
    barWidth: 2,
    cursorWidth: 0,
  });
  sourceWavesurfer.loadBlob(blob);
  setSourcePlayState(false);
  sourceWavesurfer.on("play", () => setSourcePlayState(true));
  sourceWavesurfer.on("pause", () => setSourcePlayState(false));
  sourceWavesurfer.on("finish", () => setSourcePlayState(false));
}

sourcePlayBtn.addEventListener("click", () => {
  if (sourceWavesurfer) sourceWavesurfer.playPause();
});

function setSource(kind, blob, filename) {
  selectedSource = { blob, filename };
  sourceSummaryText.textContent =
    kind === "file" ? `Selected file: ${filename}` : `Recorded audio ready: ${filename}`;
  // Unhide the review panel before creating the wavesurfer instance — its
  // container needs real (non-zero) layout dimensions at creation time.
  setCardState("review");
  loadSourcePreview(blob);
}

function clearSource() {
  selectedSource = null;
  fileInput.value = "";
  teardownSourceWavesurfer();
  setCardState("idle");
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
}

function resetPauseButton() {
  pauseBtnLabel.textContent = "Pause";
  pauseBtnIconPause.hidden = false;
  pauseBtnIconResume.hidden = true;
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
      pauseBtnIconPause.hidden = true;
      pauseBtnIconResume.hidden = false;
    });
    recordPlugin.on("record-resume", () => {
      renderRecordStatus(false);
      pauseBtnLabel.textContent = "Pause";
      pauseBtnIconPause.hidden = false;
      pauseBtnIconResume.hidden = true;
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
    return;
  }
  if (!res.ok) return;

  let data = await res.json().catch(() => null);
  if (!data || data.status === "ready") return;

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

    if (data.status === "interrupted") {
      downloadProgressBar.removeAttribute("value");
      const partialText = data.downloaded_mb != null ? ` (${data.downloaded_mb} / ${data.total_mb} MB cached)` : "";
      downloadProgressLabel.textContent = `Download of "${data.model}" was interrupted${partialText}. Try transcribing again to resume.`;
      downloadProgressDetail.textContent = "";
      break;
    }

    const now = Date.now();
    const elapsedSec = Math.floor((now - startTime) / 1000);
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
      downloadProgressDetail.textContent = `${data.percent}% — ${data.downloaded_mb} / ${data.total_mb} MB${speedText} — ${elapsedSec}s elapsed`;
    } else {
      downloadProgressBar.removeAttribute("value");
      const byteText = data.downloaded_mb != null ? `${data.downloaded_mb} MB downloaded so far` : "Preparing download";
      downloadProgressDetail.textContent = `${byteText}${speedText} — ${elapsedSec}s elapsed`;
    }
  }

  if (data.status !== "interrupted") downloadProgress.hidden = true;
}

transcribeBtn.addEventListener("click", async () => {
  if (!selectedSource) return;

  transcribeBtn.disabled = true;
  statusEl.textContent = "";
  resultSection.hidden = true;

  if (engineSelect.value === "faster-whisper") {
    setBusyStatus(statusEl, "Checking model availability…");
    await ensureModelReady(modelSelect.value);
  }

  const formData = new FormData();
  formData.append("file", selectedSource.blob, selectedSource.filename);
  if (languageSelect.value) formData.append("language", languageSelect.value);
  const isTextualFormat = formatSelect.value !== "odt";
  formData.append("output_format", formatSelect.value);
  formData.append("engine", engineSelect.value);
  if (engineSelect.value === "faster-whisper") {
    formData.append("model", modelSelect.value);
  }

  // No real progress signal available from a single blocking /api/transcribe
  // call, so this is an honest elapsed-time indicator (proves it's alive)
  // rather than a fake percentage — same reasoning as the model-download
  // progress bar's elapsed counter.
  const transcribeStart = Date.now();
  const transcribeTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - transcribeStart) / 1000);
    setBusyStatus(statusEl, `Transcribing… ${elapsed}s elapsed`);
  }, 500);
  setBusyStatus(statusEl, "Transcribing… 0s elapsed");

  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: formData });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `Request failed (${res.status})`);
    }

    const blob = await res.blob();
    const filename = parseFilename(res.headers.get("Content-Disposition"));

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
    // AI formatting needs editable text to work from — odt (binary)
    // output has none, so the section stays hidden in that case rather
    // than silently re-fetching a separate plain-text copy behind the
    // scenes (which is exactly the duplication this replaced).
    enhanceSection.hidden = !isTextualFormat;
    enhanceResult.hidden = true;
    enhanceStatus.textContent = "";
    lastEnhancedMarkdown = null;
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
  enhanceCopyIconCopy.hidden = false;
  enhanceCopyIconCheck.hidden = true;
}

enhanceCopyBtn.addEventListener("click", async () => {
  if (!lastEnhancedMarkdown) return;
  try {
    await copyTextToClipboard(lastEnhancedMarkdown);
    enhanceCopyLabel.textContent = "Copied!";
    enhanceCopyIconCopy.hidden = true;
    enhanceCopyIconCheck.hidden = false;
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
