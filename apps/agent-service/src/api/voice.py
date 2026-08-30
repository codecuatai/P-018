"""Speech-to-Text and Text-to-Speech voice endpoints.

STT: Accepts audio upload, transcribes via Gemini Flash multimodal.
TTS: Accepts text, returns MP3 audio stream via Edge TTS (vi-VN-HoaiMyNeural).

Design: stateless, idempotent, no audio retention.
"""
from __future__ import annotations

import logging
import mimetypes
import re
from typing import Annotated

import edge_tts
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel

from src.api.dependencies import require_actor
from src.config import get_settings
from src.services.llm import KEY_POOL, gemini_model_names, provider_error_category

logger = logging.getLogger(__name__)
stt_tts_router = APIRouter()

_MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MiB
_ACCEPTED_MIME_PREFIXES = ("audio/", "video/webm")


class TranscriptResponse(BaseModel):
    text: str
    provider: str = "gemini-flash"


def _resolve_mime(upload: UploadFile) -> str:
    if upload.content_type and upload.content_type != "application/octet-stream":
        return upload.content_type
    if upload.filename:
        guessed, _ = mimetypes.guess_type(upload.filename)
        if guessed:
            return guessed
    return "audio/webm"


@stt_tts_router.post("/speech-to-text", response_model=TranscriptResponse)
async def speech_to_text(
    file: Annotated[UploadFile, File(description="Audio file to transcribe")],
    actor_id: str = Depends(require_actor),
) -> TranscriptResponse:
    settings = get_settings()

    await KEY_POOL.refresh_if_needed(settings)
    keys = KEY_POOL.get_keys_for_invocation(settings)
    if not keys:
        raise HTTPException(status_code=503, detail="Voice transcription unavailable — no API key.")

    mime = _resolve_mime(file)
    if not any(mime.startswith(p) for p in _ACCEPTED_MIME_PREFIXES):
        raise HTTPException(status_code=415, detail=f"Unsupported audio format: {mime}")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file.")
    if len(data) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 10 MiB).")

    text = ""
    last_error: Exception | None = None

    # Keep voice on the same configured model policy as the normal Agent path.
    # The old hard-coded model can disappear from the provider catalog while the
    # configured primary/fallback pair remains valid.
    for model_name in gemini_model_names(settings):
        try_next_model = True
        for key in keys:
            try:
                client = genai.Client(api_key=key)
                response = await client.aio.models.generate_content(
                    model=model_name,
                    contents=[genai_types.Content(parts=[
                        genai_types.Part.from_bytes(data=data, mime_type=mime),
                        genai_types.Part.from_text(
                            text="Transcribe the audio exactly as spoken. "
                            "Return ONLY the transcription text, nothing else. "
                            "If the audio is in Vietnamese, transcribe in Vietnamese."
                        ),
                    ])],
                )
                text = (response.text or "").strip()
                if text:
                    KEY_POOL.mark_key_success(key)
                    break
            except Exception as e:
                last_error = e
                category = provider_error_category(e)
                if category != "model_unavailable":
                    KEY_POOL.mark_key_failure(key, category)
                if category in {
                    "quota_or_rate_limit",
                    "temporary_provider_failure",
                    "authentication_or_permission",
                    "timeout_or_network",
                    "model_unavailable",
                }:
                    continue
                try_next_model = False
                break
        if text or not try_next_model:
            break

    if not text:
        if last_error:
            logger.exception("Gemini voice transcription failed", exc_info=last_error)
        raise HTTPException(status_code=502, detail="Voice transcription service temporarily unavailable.")

    return TranscriptResponse(text=text)


# ---------------------------------------------------------------------------
# Text-to-Speech (Edge TTS — vi-VN-HoaiMyNeural)
# ---------------------------------------------------------------------------

_TTS_VOICE = "vi-VN-HoaiMyNeural"
_MAX_TTS_CHARS = 5000


class TextToSpeechRequest(BaseModel):
    text: str


def _strip_markdown(text: str) -> str:
    """Remove markdown formatting so TTS reads clean prose."""
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)   # [text](url)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)  # ![alt](url)
    text = re.sub(r"```[\s\S]*?```", "", text)              # code blocks
    text = re.sub(r"`([^`]+)`", r"\1", text)                # inline code
    text = re.sub(r"(\*\*|__)(.*?)\1", r"\2", text)         # bold
    text = re.sub(r"(\*|_)(.*?)\1", r"\2", text)            # italic
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)  # headings
    text = re.sub(r"^[-*+]\s+", "", text, flags=re.MULTILINE)   # list markers
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)   # ordered list
    text = re.sub(r"\n{2,}", ". ", text)                    # paragraph breaks
    return text.strip()


@stt_tts_router.post("/text-to-speech")
async def text_to_speech(
    body: TextToSpeechRequest,
    actor_id: str = Depends(require_actor),
) -> StreamingResponse:
    raw_text = (body.text or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Text is required.")
    if len(raw_text) > _MAX_TTS_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Text too long (max {_MAX_TTS_CHARS} characters).",
        )

    clean_text = _strip_markdown(raw_text)
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text is empty after cleanup.")

    try:
        communicate = edge_tts.Communicate(clean_text, _TTS_VOICE)
        stream_iterator = communicate.stream().__aiter__()
        first_audio: bytes | None = None
        while first_audio is None:
            try:
                chunk = await stream_iterator.__anext__()
            except StopAsyncIteration:
                break
            if chunk["type"] == "audio" and chunk["data"]:
                first_audio = bytes(chunk["data"])

        if first_audio is None:
            raise HTTPException(
                status_code=502,
                detail="TTS service returned empty audio.",
            )

        async def audio_chunks():
            yield first_audio
            async for chunk in stream_iterator:
                if chunk["type"] == "audio" and chunk["data"]:
                    yield bytes(chunk["data"])

        return StreamingResponse(
            audio_chunks(),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=tts.mp3"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Edge TTS synthesis failed", exc_info=e)
        raise HTTPException(
            status_code=502,
            detail="Text-to-speech service temporarily unavailable.",
        )
