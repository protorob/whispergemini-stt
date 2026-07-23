from app.engines.base import Segment
from app.formats.paragraphs import group_into_paragraphs


def _format_timestamp(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def to_markdown(segments: list[Segment]) -> str:
    lines = []
    for para in group_into_paragraphs(segments):
        text = " ".join(s.text for s in para)
        lines.append(f"**[{_format_timestamp(para[0].start)}]** {text}")
        lines.append("")
    return "\n".join(lines).strip() + "\n"
