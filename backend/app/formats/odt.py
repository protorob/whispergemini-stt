from io import BytesIO

from odf.opendocument import OpenDocumentText
from odf.text import P

from app.engines.base import Segment
from app.formats.paragraphs import group_into_paragraphs


def to_odt(segments: list[Segment]) -> bytes:
    doc = OpenDocumentText()
    for para in group_into_paragraphs(segments):
        doc.text.addElement(P(text=" ".join(s.text for s in para)))

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
