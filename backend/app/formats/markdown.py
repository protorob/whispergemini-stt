from app.engines.base import Segment


def _format_timestamp(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def to_markdown(segments: list[Segment]) -> str:
    lines = []
    for seg in segments:
        lines.append(f"**[{_format_timestamp(seg.start)}]** {seg.text}")
        lines.append("")
    return "\n".join(lines).strip() + "\n"
