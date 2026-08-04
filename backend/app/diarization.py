from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.engines.base import Segment


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


def _diarize(wav_path: Path) -> list[SpeakerTurn]:
    try:
        pipeline = _get_pipeline()
        result = pipeline(str(wav_path))
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
