from langchain_core.language_models.chat_models import BaseChatModel

from src.core.config import get_settings

try:
    from langchain_groq import ChatGroq
except ModuleNotFoundError:  # Keep no-key local development dependency-free.
    ChatGroq = None  # type: ignore[assignment,misc]


def get_llm() -> BaseChatModel | None:
    """Return Groq's chat model, or ``None`` for deterministic local mode."""
    settings = get_settings()
    if not settings.groq_api_key:
        return None
    if ChatGroq is None:
        raise RuntimeError("Groq is configured but langchain-groq is not installed. Run pip install -r apps/backend/requirements.txt.")
    return ChatGroq(
        model=settings.groq_model,
        api_key=settings.groq_api_key,
        temperature=settings.llm_temperature,
    )

