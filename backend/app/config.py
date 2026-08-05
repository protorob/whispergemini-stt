import os
from dataclasses import dataclass

from dotenv import load_dotenv

from app.hardware import HardwareInfo, ModelChoice, probe_hardware, select_default

load_dotenv()


@dataclass
class Settings:
    hardware: HardwareInfo
    auto: ModelChoice
    whisper_model: str
    whisper_device: str
    whisper_compute_type: str
    parakeet_model: str
    parakeet_languages: list[str]
    gemini_model: str
    hf_token: str | None
    max_upload_mb: int


def _load_settings() -> Settings:
    hardware = probe_hardware()
    auto = select_default(hardware)
    return Settings(
        hardware=hardware,
        auto=auto,
        whisper_model=os.environ.get("WHISPER_MODEL", auto.model),
        whisper_device=os.environ.get("WHISPER_DEVICE", auto.device),
        whisper_compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", auto.compute_type),
        parakeet_model=os.environ.get("PARAKEET_MODEL", "nvidia/parakeet-tdt-1.1b"),
        parakeet_languages=[
            c.strip() for c in os.environ.get("PARAKEET_LANGUAGES", "en").split(",") if c.strip()
        ],
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
        hf_token=os.environ.get("HF_TOKEN"),
        # Kept well under the browser's hard 2GB decodeAudioData/fetch-body
        # limits (see DEVLOG) so a rejected upload gets a clear message
        # instead of a confusing client-side failure.
        max_upload_mb=int(os.environ.get("MAX_UPLOAD_MB", "1024")),
    )


settings = _load_settings()
