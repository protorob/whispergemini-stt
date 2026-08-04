from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass
class Segment:
    start: float
    end: float
    text: str
    speaker: str | None = None


class Transcriber(Protocol):
    def transcribe(self, wav_path: Path, language: str | None = None) -> list[Segment]: ...
