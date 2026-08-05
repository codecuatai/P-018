from src.config import get_settings


def get_llm_config() -> dict[str, str]:
    """Return adapter configuration without constructing or calling an LLM client.

    A concrete Gemini adapter belongs behind this boundary and must be mocked in tests.
    """
    settings = get_settings()
    return {"model": settings.gemini_model, "api_key": settings.gemini_api_key}
