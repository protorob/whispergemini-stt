import os
import tempfile
from pathlib import Path

import pypandoc


class MarkdownConversionError(RuntimeError):
    pass


def markdown_to_odt(markdown_text: str) -> bytes:
    fd, out_name = tempfile.mkstemp(suffix=".odt")
    os.close(fd)
    out_path = Path(out_name)

    try:
        pypandoc.convert_text(markdown_text, "odt", format="md", outputfile=str(out_path))
        return out_path.read_bytes()
    except Exception as exc:
        raise MarkdownConversionError(str(exc)) from exc
    finally:
        out_path.unlink(missing_ok=True)
