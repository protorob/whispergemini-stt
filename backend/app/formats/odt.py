from io import BytesIO

from odf.opendocument import OpenDocumentText
from odf.text import P

from app.engines.base import Segment
from app.formats.paragraphs import PARAGRAPH_GAP_SECONDS, group_into_paragraphs


def to_odt(segments: list[Segment], gap_seconds: float = PARAGRAPH_GAP_SECONDS) -> bytes:
    doc = OpenDocumentText()
    for para in group_into_paragraphs(segments, gap_seconds):
        text = " ".join(s.text for s in para)
        if para[0].speaker:
            text = f"{para[0].speaker}: {text}"
        doc.text.addElement(P(text=text))

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
