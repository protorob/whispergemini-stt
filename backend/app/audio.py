import os
import shutil
import subprocess
import tempfile
import wave
from functools import lru_cache
from pathlib import Path


class AudioNormalizationError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _ffmpeg_path() -> str:
    """Prefer the static ffmpeg binary bundled via imageio-ffmpeg (needed for
    the packaged desktop build, which can't rely on a system PATH) and fall
    back to a system ffmpeg for dev/Docker setups that don't have it.
    """
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg") or "ffmpeg"


def normalize_to_wav(input_path: Path) -> Path:
    """Convert any input audio/video file to 16kHz mono PCM WAV via ffmpeg.

    Using ffmpeg here (rather than relying on each engine's own decoder)
    means every engine sees the same clean input regardless of the
    upload's original container/codec. See PLAN.md for the rationale.
    """
    fd, output_name = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    output_path = Path(output_name)

    result = subprocess.run(
        [
            _ffmpeg_path(), "-y",
            "-i", str(input_path),
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            str(output_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        output_path.unlink(missing_ok=True)
        raise AudioNormalizationError(result.stderr.strip()[-2000:])

    return output_path


def wav_duration_seconds(wav_path: Path) -> float:
    with wave.open(str(wav_path), "rb") as f:
        return f.getnframes() / float(f.getframerate())
