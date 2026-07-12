import os
import subprocess
import sys
from dataclasses import dataclass

MODEL_SIZES = ["tiny", "base", "small", "medium", "large-v3"]


@dataclass
class HardwareInfo:
    gpu_present: bool  # a CUDA-capable GPU chip was detected (nvidia-smi)
    gpu_usable: bool  # a real inference smoke test on that GPU actually succeeded
    gpu_name: str | None
    vram_mb: int
    cpu_count: int
    ram_mb: int


@dataclass
class ModelChoice:
    engine: str
    model: str
    device: str
    compute_type: str


def _gpu_inference_smoke_test() -> bool:
    """Actually run a tiny inference on CUDA, not just check device presence.

    Device enumeration (e.g. ctranslate2.get_cuda_device_count()) and even
    model loading can succeed while the actual matrix-multiply library
    (libcublas) is missing at runtime, which only surfaces once you run
    inference. So this loads the smallest model on cuda and transcribes a
    second of silence to confirm the full stack (driver + cuDNN + cuBLAS)
    genuinely works before we commit the whole app to using the GPU.
    """
    try:
        import numpy as np
        from faster_whisper import WhisperModel

        model = WhisperModel("tiny", device="cuda", compute_type="float16")
        list(model.transcribe(np.zeros(16000, dtype=np.float32))[0])
        return True
    except Exception:
        return False


def _gpu_description() -> tuple[str | None, int]:
    """Best-effort GPU name/VRAM via nvidia-smi, purely for display purposes."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None, 0

    if result.returncode != 0 or not result.stdout.strip():
        return None, 0

    name, vram = result.stdout.strip().splitlines()[0].split(",")
    return name.strip(), int(vram.strip())


def _ram_mb() -> int:
    if sys.platform.startswith("linux"):
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        return int(line.split()[1]) // 1024
        except OSError:
            pass
        return 0

    if sys.platform == "win32":
        import ctypes

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        try:
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))  # type: ignore[attr-defined]
            return stat.ullTotalPhys // (1024 * 1024)
        except Exception:
            return 0

    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=5
            )
            return int(result.stdout.strip()) // (1024 * 1024)
        except Exception:
            return 0

    return 0


def probe_hardware() -> HardwareInfo:
    gpu_name, vram_mb = _gpu_description()
    gpu_present = gpu_name is not None
    gpu_usable = gpu_present and _gpu_inference_smoke_test()
    return HardwareInfo(
        gpu_present=gpu_present,
        gpu_usable=gpu_usable,
        gpu_name=gpu_name,
        vram_mb=vram_mb,
        cpu_count=os.cpu_count() or 1,
        ram_mb=_ram_mb(),
    )


def select_default(hw: HardwareInfo) -> ModelChoice:
    if hw.gpu_usable:
        if hw.vram_mb >= 10_000:
            return ModelChoice("faster-whisper", "large-v3", "cuda", "float16")
        if hw.vram_mb >= 6_000:
            return ModelChoice("faster-whisper", "large-v3", "cuda", "int8_float16")
        if hw.vram_mb >= 3_000:
            return ModelChoice("faster-whisper", "medium", "cuda", "float16")
        return ModelChoice("faster-whisper", "small", "cuda", "int8_float16")

    if hw.ram_mb >= 16_000:
        return ModelChoice("faster-whisper", "medium", "cpu", "int8")
    if hw.ram_mb >= 8_000:
        return ModelChoice("faster-whisper", "small", "cpu", "int8")
    return ModelChoice("faster-whisper", "base", "cpu", "int8")
