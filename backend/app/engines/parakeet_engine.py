from pathlib import Path

from app.audio import wav_duration_seconds
from app.engines.base import Segment


class ParakeetEngine:
    """Wraps an NVIDIA NeMo Parakeet ASR model.

    GPU-only, and `nemo_toolkit` is a heavy optional dependency (see
    requirements-gpu.txt) — imported lazily here so the base app never
    requires it unless this engine is actually instantiated.

    Unlike faster-whisper, Parakeet checkpoints are fixed to whatever
    language(s) they were trained on (no `language=` prompt) and NeMo's
    word/segment-timestamp API varies across model families and versions.
    So this engine ignores the `language` argument (the checkpoint decides)
    and falls back to a single whole-file segment if word-level timestamps
    aren't available from the loaded model — meaning SRT output may be one
    long cue instead of properly split lines. See README for details.
    """

    def __init__(self, model_name: str):
        import nemo.collections.asr as nemo_asr

        self.model = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name)
        self.model.eval()

    def transcribe(self, wav_path: Path, language: str | None = None) -> list[Segment]:
        try:
            output = self.model.transcribe([str(wav_path)], timestamps=True)
        except TypeError:
            # Some NeMo versions don't accept a `timestamps` kwarg.
            output = self.model.transcribe([str(wav_path)])

        hypothesis = output[0]
        text = getattr(hypothesis, "text", None)
        if text is None:
            text = hypothesis if isinstance(hypothesis, str) else str(hypothesis)

        segments = self._word_segments(hypothesis)
        if segments:
            return segments

        return [Segment(start=0.0, end=wav_duration_seconds(wav_path), text=text.strip())]

    def _word_segments(self, hypothesis) -> list[Segment] | None:
        try:
            words = hypothesis.timestamp["word"]
            return [Segment(start=w["start"], end=w["end"], text=w["word"]) for w in words]
        except Exception:
            return None
