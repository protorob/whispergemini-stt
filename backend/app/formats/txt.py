from app.engines.base import Segment
from app.formats.paragraphs import PARAGRAPH_GAP_SECONDS, group_into_paragraphs


def to_txt(segments: list[Segment], gap_seconds: float = PARAGRAPH_GAP_SECONDS) -> str:
    paragraphs = group_into_paragraphs(segments, gap_seconds)
    text = "\n\n".join(" ".join(s.text for s in para) for para in paragraphs)
    return text.strip() + "\n"
