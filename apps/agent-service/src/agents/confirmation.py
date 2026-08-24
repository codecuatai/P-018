from __future__ import annotations

import re
import unicodedata

_CONFIRMATION_PHRASES = {
    "ok",
    "oke",
    "dong y",
    "toi dong y",
    "minh dong y",
    "xac nhan",
    "toi xac nhan",
    "minh xac nhan",
    "xac nhan lich",
    "xac nhan lich kham",
    "xac nhan dat",
    "xac nhan dich vu",
    "hoan tat lich",
    "tiep tuc",
    "tiep tuc nhe",
    "dat di",
    "giu ban",
    "giu khung",
    "giu slot",
    "duoc",
    "duoc nhe",
}

_NEGATION_OR_CHANGE = re.compile(
    r"\b(?:khong|chua|dung|huy|khoan|doi|thay|sua|nham|nhung|ma|"
    r"khong phai|chua chac|de toi|de minh)\b"
)
_QUESTION_MARKERS = re.compile(
    r"\b(?:co nen|co phai|duoc khong|phai khong|chua|the nao|bao nhieu|tai sao)\b"
)
_POLITE_SUFFIX = re.compile(r"\s+(?:a|ah|nha|nhe|voi|giup toi|giup minh)+$")


def normalize_confirmation_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.casefold())
    without_marks = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    ascii_d = without_marks.replace("đ", "d").replace("ð", "d")
    return " ".join(re.findall(r"[a-z0-9]+", ascii_d))


def is_explicit_confirmation(value: str) -> bool:
    """Accept an unambiguous confirmation utterance, never a matching substring."""
    raw = value.strip()
    normalized = normalize_confirmation_text(raw)
    if not normalized or "?" in raw:
        return False
    if _NEGATION_OR_CHANGE.search(normalized) or _QUESTION_MARKERS.search(normalized):
        return False
    candidate = _POLITE_SUFFIX.sub("", normalized).strip()
    return candidate in _CONFIRMATION_PHRASES
