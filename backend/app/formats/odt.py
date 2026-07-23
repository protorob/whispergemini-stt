from io import BytesIO

from odf.opendocument import OpenDocumentText
from odf.text import P

from app.engines.base import Segment
from app.formats.paragraphs import PARAGRAPH_GAP_SECONDS, group_into_paragraphs


def to_odt(segments: list[Segment], gap_seconds: float = PARAGRAPH_GAP_SECONDS) -> bytes:
    doc = OpenDocumentText()
    for para in group_into_paragraphs(segments, gap_seconds):
        doc.text.addElement(P(text=" ".join(s.text for s in para)))

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
