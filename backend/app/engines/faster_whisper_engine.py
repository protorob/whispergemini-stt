from pathlib import Path

from faster_whisper import WhisperModel

from app.engines.base import Segment


class FasterWhisperEngine:
    def __init__(self, model_size: str, device: str, compute_type: str):
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)

    def transcribe(self, wav_path: Path, language: str | None = None) -> list[Segment]:
        segments, _info = self.model.transcribe(str(wav_path), language=language)
        return [Segment(start=s.start, end=s.end, text=s.text.strip()) for s in segments]
