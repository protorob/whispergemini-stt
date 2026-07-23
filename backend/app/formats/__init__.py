from dataclasses import dataclass
from typing import Callable

from app.engines.base import Segment
from app.formats.markdown import to_markdown
from app.formats.odt import to_odt
from app.formats.srt import to_srt
from app.formats.txt import to_txt


@dataclass
class OutputFormat:
    render: Callable[[list[Segment], float], str | bytes]
    media_type: str
    extension: str


FORMATS: dict[str, OutputFormat] = {
    "txt": OutputFormat(to_txt, "text/plain", "txt"),
    "md": OutputFormat(to_markdown, "text/markdown", "md"),
    "srt": OutputFormat(to_srt, "application/x-subrip", "srt"),
    "odt": OutputFormat(to_odt, "application/vnd.oasis.opendocument.text", "odt"),
}
