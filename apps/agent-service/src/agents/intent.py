from __future__ import annotations

import re
import unicodedata


def plain(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")


def _restore_query_spelling(original: str, normalized_query: str) -> str:
    """Preserve user spelling while using folded text for intent matching."""
    wanted = plain(normalized_query).split()
    if not wanted:
        return normalized_query
    tokens = re.findall(r"[^\W_]+", original, flags=re.UNICODE)
    folded_tokens = [plain(token) for token in tokens]
    width = len(wanted)
    for index in range(len(folded_tokens) - width + 1):
        if folded_tokens[index:index + width] == wanted:
            return " ".join(tokens[index:index + width])
    return normalized_query


def classify(query: str) -> str:
    text = plain(query)
    if any(value in text for value in ("bo qua xac nhan", "goi execute", "khiếu nại", "chuyen bay", "dat ban")):
        return "out_of_scope"
    if any(value in text for value in ("theo doi", "tracking", "don hang dang")):
        return "track_order"
    if any(value in text for value in ("huy", "huỷ")):
        return "cancel_order"
    if any(value in text for value in ("dat luon", "thanh toan di", "toi dong y", "dat mon")):
        return "place_order"
    if any(value in text for value in ("bo ma", "xoa ma", "go ma", "bo voucher")):
        return "remove_voucher"
    if any(value in text for value in ("voucher", "ma giam", "ap ma")):
        return "apply_voucher"
    if any(value in text for value in ("phi giao", "ship bao nhieu", "giao den", "giao ve", "giao toi")):
        # An initial food search can naturally include its eventual delivery
        # preference (for example, "Tìm phở giao về nhà").  It must first
        # find authoritative restaurant/item candidates; a delivery quote
        # only makes sense after that selection is present in workflow context.
        if any(value in text for value in ("tim", "an gi")):
            return "search_food"
        return "quote_delivery"
    if any(value in text for value in ("xem menu", "thuc don", "menu")):
        return "view_menu"
    if any(value in text for value in ("tao gio", "mo gio")):
        return "create_cart"
    if any(value in text for value in ("bo mon", "xoa mon")):
        return "remove_cart_item"
    if any(value in text for value in ("doi mon", "sua gio", "cap nhat gio")):
        return "update_cart"
    if any(value in text for value in ("chon mon", "lay mon", "mon dau tien", "mon thu hai", "mon so")):
        return "select_menu_item"
    if any(value in text for value in ("them", "cho vao gio", "mua", "cho toi", "toi muon")):
        return "add_to_cart"
    if any(value in text for value in ("xem tong", "preview", "xem don")):
        return "preview_order"
    if any(value in text for value in ("chon quan", "chon nha hang")):
        return "select_restaurant"
    if any(value in text for value in ("tim", "an gi", "mon", "nha hang")):
        return "search_food"
    return "general_food_support"


def _dish_query(text: str) -> str | None:
    cleaned = re.sub(r"\b(?:tim|lay|chon|mon|do an|nha hang|cho toi|toi muon|mua|them|bat|phan|to)\b", " ", text)
    cleaned = re.sub(r"\bap ma\b.*$", " ", cleaned)
    cleaned = re.sub(r"\b(?:mot|hai|ba|bon|nam|[1-9][0-9]?)\b", " ", cleaned)
    cleaned = re.sub(r"\b(?:co lon|size lon|size thuong|khong cay|it cay|cay|nha rieng|duoi \d+ nghin)\b", " ", cleaned)
    cleaned = re.split(r"\b(?:giao\s+(?:ve|toi)|ship|(?:va|roi)\s+(?:dat|goi)|dat\s+lich|goi\s+xe|da\s+vao\s+gio|da\s+chon\s+vao\s+gio|vao\s+gio)\b", cleaned, maxsplit=1)[0]
    cleaned = re.sub(r"\b(?:o|tai|khu vuc)\s+[a-z ]+[.!?,;:]*$", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,!?;:")
    return cleaned or None


def extract_slots(query: str) -> dict[str, object]:
    text = plain(query)
    slots: dict[str, object] = {}
    quantity = re.search(r"\b([1-9][0-9]?)\b", text)
    if quantity:
        slots["quantity"] = int(quantity.group(1))
    else:
        for word, value in (("mot", 1), ("hai", 2), ("ba", 3), ("bon", 4), ("nam", 5)):
            if re.search(rf"\b{word}\b", text):
                slots["quantity"] = value
                break
    if "co lon" in text or "size lon" in text or re.search(r"\blon\b", text):
        slots.setdefault("option_preferences", []).append({"concept": "size", "value": "lon"})
    if "khong cay" in text:
        slots.setdefault("option_preferences", []).append({"concept": "spice", "value": "khong cay"})
    elif "it cay" in text:
        slots.setdefault("option_preferences", []).append({"concept": "spice", "value": "it cay"})
    if "them nem" in text:
        slots.setdefault("option_preferences", []).append({"concept": "extra", "value": "nem"})
    if "nha rieng" in text or "dia chi" in text or "giao ve" in text or "giao toi" in text or "giao den" in text:
        delivery = re.search(r"\bgiao\s+(?:ve|toi|den)\s+(.+?)(?:[.!?,;:]|$)", text)
        slots["address_query"] = "nha rieng" if "nha rieng" in text else (delivery.group(1).strip() if delivery else text)
    if "quan dau tien" in text or "nha hang dau tien" in text:
        slots["restaurant_alias"] = "first"
    elif "quan thu hai" in text or "nha hang thu hai" in text:
        slots["restaurant_alias"] = "second"
    if "mon dau tien" in text or "mon so mot" in text:
        slots["menu_item_alias"] = "first"
    elif "mon thu hai" in text or "mon so hai" in text:
        slots["menu_item_alias"] = "second"
    else:
        ordinal = re.search(r"\b(?:mon|cai)\s+(?:so|thu)\s*([1-9][0-9]?)\b", text)
        if ordinal:
            slots["selection_index"] = int(ordinal.group(1)) - 1
    if "don vua dat" in text or "don vua tao" in text or "don gan nhat" in text:
        slots["order_alias"] = "last"
    voucher = re.search(r"\b[A-Z][A-Z0-9]{3,}\b", query)
    if voucher:
        slots["voucher_code"] = voucher.group(0).upper()
    max_price = re.search(r"(?:duoi|khong qua|toi da)\s*(\d+)\s*(?:nghin|k|000)?", text)
    if max_price:
        value = int(max_price.group(1))
        slots["max_price"] = value * 1000 if value < 1000 else value
    district = re.search(r"\b(?:o|tai|khu vuc)\b\s+([a-z ]+?)(?:\s+(?:duoi|tren|gia)|[.!?,;:]?$)", text)
    if district:
        slots["district"] = district.group(1).strip()
    if any(value in text for value in ("tim", "an gi", "mon", "lay", "chon", "cho toi", "toi muon", "mua", "them")):
        dish = _dish_query(text)
        if dish:
            slots["dish_query"] = _restore_query_spelling(query, dish)
    return slots
