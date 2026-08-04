from app.engines.base import Segment
from app.formats.paragraphs import PARAGRAPH_GAP_SECONDS, group_into_paragraphs


def to_txt(segments: list[Segment], gap_seconds: float = PARAGRAPH_GAP_SECONDS) -> str:
    paragraphs = group_into_paragraphs(segments, gap_seconds)
    parts = []
    for para in paragraphs:
        text = " ".join(s.text for s in para)
        if para[0].speaker:
            text = f"{para[0].speaker}: {text}"
        parts.append(text)
    return "\n\n".join(parts).strip() + "\n"
