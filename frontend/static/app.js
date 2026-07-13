const fileInput = document.getElementById("file-input");
const recordBtn = document.getElementById("record-btn");
const recordBtnLabel = document.getElementById("record-btn-label");
const recordBtnIconMic = document.getElementById("record-btn-icon-mic");
const recordBtnIconStop = document.getElementById("record-btn-icon-stop");
const recordStatus = document.getElementById("record-status");
const pauseBtn = document.getElementById("pause-btn");
const pauseBtnLabel = document.getElementById("pause-btn-label");
const pauseBtnIconPause = document.getElementById("pause-btn-icon-pause");
const pauseBtnIconResume = document.getElementById("pause-btn-icon-resume");
const sourceSummary = document.getElementById("source-summary");
const sourceSummaryText = document.getElementById("source-summary-text");
const clearSourceBtn = document.getElementById("clear-source-btn");
const sourceAudioPreview = document.getElementById("source-audio-preview");
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

let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSegmentStart = null; // Date.now() when the current running segment began, or null while paused
let recordingAccumulatedMs = 0; // elapsed time banked from segments before the current one
let isPaused = false;
let selectedSource = null; // { blob, filename }
let sourcePreviewUrl = null; // object URL currently backing the source-audio-preview element
let engineLanguageSupport = {}; // engine name -> list of supported codes, or null for unrestricted
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

function setSource(kind, blob, filename) {
  selectedSource = { blob, filename };
  sourceSummary.hidden = false;
  sourceSummaryText.textContent =
    kind === "file" ? `Selected file: ${filename}` : `Recorded audio ready: ${filename}`;
  transcribeBtn.disabled = false;

  if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = URL.createObjectURL(blob);
  sourceAudioPreview.src = sourcePreviewUrl;
  sourceAudioPreview.hidden = false;
}

function clearSource() {
  selectedSource = null;
  fileInput.value = "";
  sourceSummary.hidden = true;
  transcribeBtn.disabled = true;

  if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = null;
  sourceAudioPreview.pause();
  sourceAudioPreview.removeAttribute("src");
  sourceAudioPreview.hidden = true;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  setSource("file", file, file.name);
});

clearSourceBtn.addEventListener("click", clearSource);

function resetPauseButton() {
  isPaused = false;
  pauseBtnLabel.textContent = "Pause";
  pauseBtnIconPause.hidden = false;
  pauseBtnIconResume.hidden = true;
}

recordBtn.addEventListener("click", async () => {
  if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      clearInterval(recordingTimer);
      recordBtnLabel.textContent = "Start recording";
      recordBtnIconMic.hidden = false;
      recordBtnIconStop.hidden = true;
      recordBtn.classList.remove("recording");
      recordStatus.textContent = "";
      pauseBtn.hidden = true;
      resetPauseButton();

      const mimeType = mediaRecorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunks, { type: mimeType });
      const filename = `recording.${extensionFromMimeType(mimeType)}`;
      fileInput.value = "";
      setSource("recording", blob, filename);
    });

    mediaRecorder.start();
    recordBtnLabel.textContent = "Stop recording";
    recordBtnIconMic.hidden = true;
    recordBtnIconStop.hidden = false;
    recordBtn.classList.add("recording");
    pauseBtn.hidden = false;
    resetPauseButton();
    recordingAccumulatedMs = 0;
    recordingSegmentStart = Date.now();
    recordingTimer = setInterval(() => {
      const runningMs = recordingSegmentStart != null ? Date.now() - recordingSegmentStart : 0;
      const elapsed = Math.floor((recordingAccumulatedMs + runningMs) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      recordStatus.textContent = `${isPaused ? "Paused" : "Recording…"} ${mm}:${ss}`;
    }, 500);
  } catch (err) {
    statusEl.textContent = `Microphone access failed: ${err.message}`;
  }
});

pauseBtn.addEventListener("click", () => {
  if (!mediaRecorder) return;

  if (mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    recordingAccumulatedMs += Date.now() - recordingSegmentStart;
    recordingSegmentStart = null;
    isPaused = true;
    pauseBtnLabel.textContent = "Resume";
    pauseBtnIconPause.hidden = true;
    pauseBtnIconResume.hidden = false;
    recordBtn.classList.remove("recording");
  } else if (mediaRecorder.state === "paused") {
    mediaRecorder.resume();
    recordingSegmentStart = Date.now();
    isPaused = false;
    pauseBtnLabel.textContent = "Pause";
    pauseBtnIconPause.hidden = false;
    pauseBtnIconResume.hidden = true;
    recordBtn.classList.add("recording");
  }
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

  downloadProgress.hidden = true;
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
