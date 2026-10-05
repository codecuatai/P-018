from __future__ import annotations

import re
import unicodedata

_CLEAR_CONFIRMATIONS = {
    "xac nhan",
    "dong y",
    "ok",
    "oke",
    "giu ban",
    "toi dong y",
    "minh xac nhan nhe",
}


def _fold(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.lower())
    without_marks = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", without_marks.replace("đ", "d")).strip(" .,!?")

def is_explicit_confirmation(resolved_confirmation: object) -> bool:
    """Accept a typed decision or an unambiguous, bounded confirmation phrase.

    Questions, negations, and phrases with additional wording stay false; a
    confirmation must still be tied to an outstanding proposal by the caller.
    """
    if resolved_confirmation is True:
        return True
    if not isinstance(resolved_confirmation, str):
        return False
    folded = _fold(resolved_confirmation)
    if "?" in resolved_confirmation or any(
        marker in f" {folded} "
        for marker in (" khong ", " chua ", " khoan ", " doi gio ", " chua chac ")
    ):
        return False
    return folded in _CLEAR_CONFIRMATIONS or folded == "xac nhan lich kham"
