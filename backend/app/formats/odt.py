from io import BytesIO

from odf.opendocument import OpenDocumentText
from odf.text import P

from app.engines.base import Segment


def to_odt(segments: list[Segment]) -> bytes:
    doc = OpenDocumentText()
    for seg in segments:
        doc.text.addElement(P(text=seg.text))

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
