import wave
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


def _import_pyannote_quietly():
    # pyannote.audio's io module checks torchcodec availability the moment
    # it's imported and warns loudly (via warnings.warn, not logging) if
    # that check fails — regardless of whether torchcodec's file-path
    # decoding is ever actually used, which we never do (see
    # _load_waveform below). A plain module-level warnings.filterwarnings
    # call here turned out not to reliably win: something later in
    # pyannote/torch's own import chain resets or reorders the global
    # filter list, so the warning still slipped through. Scoping the
    # suppression to a catch_warnings() block around just this import is
    # immune to that, since it snapshots/restores the filter list itself.
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        import pyannote.audio

    return pyannote.audio


def diarization_importable() -> bool:
    """pyannote.audio pulls in torch — a heavy optional dependency (see
    requirements-diarization.txt) — so this is imported lazily here, the
    same pattern as the Parakeet engine's own importability check."""
    try:
        _import_pyannote_quietly()
        return True
    except Exception:
        return False


@lru_cache(maxsize=1)
def _get_pipeline():
    _import_pyannote_quietly()
    from pyannote.audio import Pipeline

    try:
        # Current pyannote.audio (matching huggingface_hub's own rename)
        # takes `token=`.
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1", token=settings.hf_token
        )
    except TypeError:
        # Older pyannote.audio releases only accept the pre-rename
        # `use_auth_token=` kwarg instead.
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


def _extract_tracks(result):
    # pyannote.audio's pipeline output type isn't stable across versions —
    # older releases return a pyannote.core.Annotation directly (which has
    # .itertracks()); some newer releases wrap it in another object (e.g.
    # "DiarizeOutput") under an attribute we have to guess at without
    # access to that version's docs/source from here. Try the known shapes
    # in order, and if none match, fail with a diagnostic listing the
    # object's actual attributes instead of a bare AttributeError, so the
    # right one can be identified and added here without more guessing.
    if hasattr(result, "itertracks"):
        return list(result.itertracks(yield_label=True))

    for attr in ("speaker_diarization", "annotation", "diarization"):
        candidate = getattr(result, attr, None)
        if candidate is not None and hasattr(candidate, "itertracks"):
            return list(candidate.itertracks(yield_label=True))

    public_attrs = [a for a in dir(result) if not a.startswith("_")]
    raise DiarizationError(
        f"unrecognized diarization pipeline output type "
        f"{type(result).__module__}.{type(result).__name__} — no .itertracks() "
        f"and no known wrapper attribute found. Available attributes: {public_attrs}"
    )


def _diarize(wav_path: Path) -> list[SpeakerTurn]:
    try:
        pipeline = _get_pipeline()
        result = pipeline(_load_waveform(wav_path))
        tracks = _extract_tracks(result)
    except DiarizationError:
        raise
    except Exception as exc:
        raise DiarizationError(str(exc)) from exc

    return [SpeakerTurn(start=turn.start, end=turn.end, speaker=speaker) for turn, _, speaker in tracks]


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
