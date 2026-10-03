from __future__ import annotations

import unicodedata


def plain(text: str) -> str:
    """Normalize text only for comparing already-resolved data values."""
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")
