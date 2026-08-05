import json
import tempfile
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.audio import AudioNormalizationError, normalize_to_wav
from app.config import settings
from app.diarization import DiarizationError, diarization_importable, diarize_and_label
from app.engines.base import Segment
from app.engines.faster_whisper_engine import FasterWhisperEngine
from app.enhance import (
    CREATIVITY_PRESETS,
    CUSTOM_DESCRIPTION,
    GeminiFormattingError,
    format_transcript,
    stream_format_transcript,
)
from app.formats import FORMATS
from app.formats.paragraphs import PAUSE_SENSITIVITY_SECONDS, group_into_paragraphs
from app.hardware import MODEL_SIZES
from app.markdown_odt import MarkdownConversionError, markdown_to_odt
from app.model_status import status_for, warm_up

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(title="Cassiodorus")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")

ENGINES = ["faster-whisper", "parakeet"]


def _parakeet_importable() -> bool:
    try:
        import nemo.collections.asr  # noqa: F401

        return True
    except Exception:
        return False


PARAKEET_AVAILABLE = settings.hardware.gpu_usable and _parakeet_importable()

# Diarization needs pyannote.audio installed (requirements-diarization.txt)
# and an HF_TOKEN with the pyannote/speaker-diarization-3.1 model's license
# accepted on huggingface.co — both are checked once at startup rather than
# per-request.
DIARIZATION_AVAILABLE = diarization_importable() and bool(settings.hf_token)
SPEAKER_MODES = ["single", "multiple"]


@lru_cache(maxsize=2)
def get_faster_whisper_engine(model_size: str) -> FasterWhisperEngine:
    return FasterWhisperEngine(
        model_size=model_size,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )


@lru_cache(maxsize=1)
def get_parakeet_engine():
    from app.engines.parakeet_engine import ParakeetEngine

    return ParakeetEngine(model_name=settings.parakeet_model)


def resolve_model_size(model: str) -> str:
    model_size = settings.whisper_model if model in ("", "auto") else model
    if model_size not in MODEL_SIZES:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported model '{model_size}', expected 'auto' or one of {MODEL_SIZES}",
        )
    return model_size


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/models/warmup")
def models_warmup(model: str = Form(default="auto")):
    """Kick off (or check on) a faster-whisper model download+load in the
    background, so the frontend can show real progress instead of the
    first /api/transcribe request just hanging with no feedback.
    """
    model_size = resolve_model_size(model)
    warm_up(model_size, lambda: get_faster_whisper_engine(model_size))
    return {**status_for(model_size), "model": model_size}


@app.get("/api/models/status")
def models_status(model: str = "auto"):
    model_size = resolve_model_size(model)
    return {**status_for(model_size), "model": model_size}


@app.get("/api/capabilities")
def capabilities():
    hw = settings.hardware
    return {
        "hardware": {
            "gpu_present": hw.gpu_present,
            "gpu_usable": hw.gpu_usable,
            "gpu_name": hw.gpu_name,
            "vram_mb": hw.vram_mb,
            "cpu_count": hw.cpu_count,
            "ram_mb": hw.ram_mb,
        },
        "auto_default": {
            "model": settings.auto.model,
            "device": settings.auto.device,
            "compute_type": settings.auto.compute_type,
        },
        "active": {
            "model": settings.whisper_model,
            "device": settings.whisper_device,
            "compute_type": settings.whisper_compute_type,
        },
        "available_models": MODEL_SIZES,
        "max_upload_mb": settings.max_upload_mb,
        "engines": {
            "faster-whisper": {
                "available": True,
                "requires_gpu": False,
                "supported_languages": None,
            },
            "parakeet": {
                "available": PARAKEET_AVAILABLE,
                "requires_gpu": True,
                "supported_languages": settings.parakeet_languages,
                "model": settings.parakeet_model,
            },
        },
        "diarization": {
            "available": DIARIZATION_AVAILABLE,
        },
    }


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    output_format: str = Form(default="txt"),
    model: str = Form(default="auto"),
    engine: str = Form(default="faster-whisper"),
    pause_sensitivity: str = Form(default="normal"),
    speakers: str = Form(default="single"),
):
    if output_format not in FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported output_format '{output_format}', expected one of {sorted(FORMATS)}",
        )
    fmt = FORMATS[output_format]

    if pause_sensitivity not in PAUSE_SENSITIVITY_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported pause_sensitivity '{pause_sensitivity}', "
            f"expected one of {sorted(PAUSE_SENSITIVITY_SECONDS)}",
        )
    gap_seconds = PAUSE_SENSITIVITY_SECONDS[pause_sensitivity]

    if speakers not in SPEAKER_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported speakers '{speakers}', expected one of {SPEAKER_MODES}",
        )
    if speakers == "multiple" and not DIARIZATION_AVAILABLE:
        raise HTTPException(
            status_code=400,
            detail="speaker diarization is not available on this server "
            "(requires pyannote.audio installed and HF_TOKEN set)",
        )

    if engine not in ENGINES:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported engine '{engine}', expected one of {ENGINES}",
        )

    if engine == "parakeet":
        if not PARAKEET_AVAILABLE:
            raise HTTPException(
                status_code=400,
                detail="parakeet engine is not available on this server "
                "(requires a usable GPU and nemo_toolkit installed)",
            )
        if language and language not in settings.parakeet_languages:
            raise HTTPException(
                status_code=400,
                detail=f"parakeet model '{settings.parakeet_model}' does not support "
                f"language '{language}', supported: {settings.parakeet_languages}",
            )
        model_size = None
    else:
        model_size = resolve_model_size(model)

    max_upload_bytes = settings.max_upload_mb * 1024 * 1024
    suffix = Path(file.filename or "audio").suffix or ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_in:
        input_path = Path(tmp_in.name)
        total = 0
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > max_upload_bytes:
                tmp_in.close()
                input_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"file exceeds the {settings.max_upload_mb} MB upload limit",
                )
            tmp_in.write(chunk)

    try:
        wav_path = await run_in_threadpool(normalize_to_wav, input_path)
    except AudioNormalizationError as exc:
        raise HTTPException(status_code=400, detail=f"could not decode audio: {exc}") from exc
    finally:
        input_path.unlink(missing_ok=True)

    def _run_transcription() -> list[Segment]:
        transcriber = get_parakeet_engine() if engine == "parakeet" else get_faster_whisper_engine(model_size)
        return transcriber.transcribe(wav_path, language=language or None)

    speaker_turns = []
    try:
        # ffmpeg normalization and the model's transcribe() call are both
        # blocking, CPU/GPU-bound work — running them inline in this async
        # endpoint would freeze the whole event loop (and every other
        # request, including /api/models/status polling) until they finish.
        segments = await run_in_threadpool(_run_transcription)
        if speakers == "multiple":
            try:
                segments, speaker_turns = await run_in_threadpool(diarize_and_label, wav_path, segments)
            except DiarizationError as exc:
                raise HTTPException(status_code=500, detail=f"speaker diarization failed: {exc}") from exc
    finally:
        wav_path.unlink(missing_ok=True)

    content = fmt.render(segments, gap_seconds)
    if isinstance(content, str):
        content = content.encode("utf-8")

    # Start-of-paragraph times (seconds), skipping the very first paragraph
    # since a marker at t=0 isn't useful — lets the frontend drop a marker
    # on the waveform everywhere Whisper detected a long-enough pause.
    paragraphs = group_into_paragraphs(segments, gap_seconds)
    pause_markers = [para[0].start for para in paragraphs[1:]]

    return Response(
        content=content,
        media_type=fmt.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="transcript.{fmt.extension}"',
            "X-Pause-Markers": json.dumps(pause_markers),
            "X-Speaker-Segments": json.dumps(
                [{"start": t.start, "end": t.end, "speaker": t.speaker} for t in speaker_turns]
            ),
        },
    )


@app.get("/api/enhance/options")
def enhance_options():
    return {
        "presets": {
            key: {"label": p.label, "description": p.description} for key, p in CREATIVITY_PRESETS.items()
        },
        "custom_description": CUSTOM_DESCRIPTION,
    }


@app.post("/api/enhance")
def enhance(
    text: str = Form(...),
    api_key: str = Form(...),
    model: str = Form(default=""),
    creativity: str = Form(default="verbatim"),
    custom_style: str = Form(default=""),
):
    """Non-streaming variant — kept mainly for easy curl testing. The
    frontend uses /api/enhance/stream instead, for progressive output.

    The API key is only ever used for this one request — never logged,
    never written to disk. The frontend stores it in the browser's
    localStorage, not on the server.
    """
    model_name = model.strip() or settings.gemini_model
    try:
        markdown = format_transcript(text, api_key, model_name, creativity, custom_style)
    except GeminiFormattingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"markdown": markdown}


@app.post("/api/enhance/stream")
def enhance_stream(
    text: str = Form(...),
    api_key: str = Form(...),
    model: str = Form(default=""),
    creativity: str = Form(default="verbatim"),
    custom_style: str = Form(default=""),
):
    """Server-Sent Events stream of Gemini's output as it's generated, so
    the frontend can show the formatted text appearing progressively
    instead of a static "please wait" message with no real feedback."""
    model_name = model.strip() or settings.gemini_model

    def event_stream():
        try:
            for chunk in stream_format_transcript(text, api_key, model_name, creativity, custom_style):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except GeminiFormattingError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/enhance/odt")
def enhance_odt(markdown: str = Form(...)):
    try:
        content = markdown_to_odt(markdown)
    except MarkdownConversionError as exc:
        raise HTTPException(status_code=500, detail=f"could not convert to odt: {exc}") from exc

    return Response(
        content=content,
        media_type="application/vnd.oasis.opendocument.text",
        headers={"Content-Disposition": 'attachment; filename="transcript-formatted.odt"'},
    )


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")
