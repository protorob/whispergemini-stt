from app.engines.base import Segment
from app.formats.paragraphs import group_into_paragraphs


def to_txt(segments: list[Segment]) -> str:
    paragraphs = group_into_paragraphs(segments)
    text = "\n\n".join(" ".join(s.text for s in para) for para in paragraphs)
    return text.strip() + "\n"
