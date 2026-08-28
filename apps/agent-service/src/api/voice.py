"""Speech-to-Text endpoint using Gemini Flash multimodal.

Accepts audio upload (multipart/form-data, field name "file"),
validates, and returns JSON transcript. Uses the KEY_POOL for reliability
and rotation.

Design: stateless, idempotent, no audio retention.
"""
from __future__ import annotations

import logging
import mimetypes
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel

from src.api.dependencies import require_actor
from src.config import get_settings
from src.services.llm import KEY_POOL, provider_error_category

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
    
    for key in keys:
        try:
            client = genai.Client(api_key=key)
            response = await client.aio.models.generate_content(
                model="gemini-2.0-flash",
                contents=[genai_types.Content(parts=[
                    genai_types.Part.from_bytes(data=data, mime_type=mime),
                    genai_types.Part.from_text(
                        "Transcribe the audio exactly as spoken. "
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
            KEY_POOL.mark_key_failure(key, category)
            if category in {
                "quota_or_rate_limit",
                "temporary_provider_failure",
                "authentication_or_permission",
                "timeout_or_network",
            }:
                continue
            break

    if not text:
        if last_error:
            logger.exception("Gemini voice transcription failed", exc_info=last_error)
        raise HTTPException(status_code=502, detail="Voice transcription service temporarily unavailable.")

    return TranscriptResponse(text=text)
