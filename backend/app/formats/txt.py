from app.engines.base import Segment


def to_txt(segments: list[Segment]) -> str:
    return " ".join(s.text for s in segments).strip() + "\n"
