import warnings
import wave
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.engines.base import Segment

# pyannote.audio's io module checks torchcodec availability the moment it's
# imported and warns loudly if that check fails — regardless of whether
# torchcodec's file-path decoding is actually ever used. We never use it
# (see _load_waveform below, which reads the WAV ourselves and hands
# pyannote an in-memory tensor instead), so this specific warning is just
# import-time noise in our case, not a sign anything is broken.
warnings.filterwarnings(
    "ignore", message=r"torchcodec is not installed correctly.*", category=UserWarning
)


class DiarizationError(Exception):
    pass


@dataclass
class SpeakerTurn:
    start: float
    end: float
    speaker: str


def diarization_importable() -> bool:
    """pyannote.audio pulls in torch — a heavy optional dependency (see
    requirements-diarization.txt) — so this is imported lazily here, the
    same pattern as the Parakeet engine's own importability check."""
    try:
        import pyannote.audio  # noqa: F401

        return True
    except Exception:
        return False


@lru_cache(maxsize=1)
def _get_pipeline():
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1", use_auth_token=settings.hf_token
    )

    import torch

    if torch.cuda.is_available():
        pipeline.to(torch.device("cuda"))
    return pipeline


def _load_waveform(wav_path: Path) -> dict:
    # pyannote's default file-path input decodes via torchcodec, which needs
    # an exact-matching system FFmpeg install (esp. brittle on Windows —
    # "full-shared" build, major version 4-8) and warns/fails without it.
    # We already normalize every upload to 16kHz mono PCM16 WAV via ffmpeg
    # ourselves (see audio.py), so reading it straight from Python's stdlib
    # `wave` module and handing pyannote an in-memory tensor sidesteps
    # torchcodec entirely — this is the in-memory workaround the library's
    # own warning suggests, not a hack.
    import numpy as np
    import torch

    with wave.open(str(wav_path), "rb") as f:
        sample_rate = f.getframerate()
        raw = f.readframes(f.getnframes())

    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    waveform = torch.from_numpy(samples).unsqueeze(0)  # (channel=1, time)
    return {"waveform": waveform, "sample_rate": sample_rate}


def _diarize(wav_path: Path) -> list[SpeakerTurn]:
    try:
        pipeline = _get_pipeline()
        result = pipeline(_load_waveform(wav_path))
    except Exception as exc:
        raise DiarizationError(str(exc)) from exc

    return [
        SpeakerTurn(start=turn.start, end=turn.end, speaker=speaker)
        for turn, _, speaker in result.itertracks(yield_label=True)
    ]


def _normalize_labels(turns: list[SpeakerTurn]) -> dict[str, str]:
    # Raw pyannote labels ("SPEAKER_00") aren't guaranteed to number
    # speakers in speaking order, so remap to "Speaker 1", "Speaker 2"...
    # in order of first appearance, which reads better in a transcript.
    mapping: dict[str, str] = {}
    for turn in sorted(turns, key=lambda t: t.start):
        if turn.speaker not in mapping:
            mapping[turn.speaker] = f"Speaker {len(mapping) + 1}"
    return mapping


def _speaker_at(turns: list[SpeakerTurn], start: float, end: float) -> str | None:
    # A transcription segment can straddle a speaker turn boundary — assign
    # whichever speaker turn overlaps it the most, the standard tie-break.
    best_speaker = None
    best_overlap = 0.0
    for turn in turns:
        overlap = min(end, turn.end) - max(start, turn.start)
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = turn.speaker
    return best_speaker


def diarize_and_label(
    wav_path: Path, segments: list[Segment]
) -> tuple[list[Segment], list[SpeakerTurn]]:
    """Runs pyannote diarization on wav_path and returns a copy of segments
    with .speaker filled in (by timestamp-overlap with detected speaker
    turns), plus the normalized speaker turns themselves — the latter is
    what the frontend draws as waveform overlays."""
    turns = _diarize(wav_path)
    if not turns:
        return segments, []

    label_map = _normalize_labels(turns)
    labeled_segments = [
        Segment(
            start=seg.start,
            end=seg.end,
            text=seg.text,
            speaker=label_map.get(_speaker_at(turns, seg.start, seg.end)),
        )
        for seg in segments
    ]
    labeled_turns = [SpeakerTurn(t.start, t.end, label_map[t.speaker]) for t in turns]
    return labeled_segments, labeled_turns
