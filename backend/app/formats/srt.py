from app.engines.base import Segment


def _format_timestamp(seconds: float) -> str:
    total_ms = round(seconds * 1000)
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def to_srt(segments: list[Segment], gap_seconds: float = 0.0) -> str:
    # gap_seconds is accepted for a uniform signature across formats but
    # unused here — SRT cues are always one per segment, pause sensitivity
    # only affects formats that group segments into paragraphs.
    lines = []
    for i, seg in enumerate(segments, start=1):
        lines.append(str(i))
        lines.append(f"{_format_timestamp(seg.start)} --> {_format_timestamp(seg.end)}")
        lines.append(f"[{seg.speaker}] {seg.text}" if seg.speaker else seg.text)
        lines.append("")
    return "\n".join(lines).strip() + "\n"
