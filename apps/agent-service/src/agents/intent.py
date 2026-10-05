from __future__ import annotations

import re
import unicodedata


def plain(text: str) -> str:
    """Normalize text only for comparing already-resolved data values."""
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join("d" if char == "đ" else char for char in normalized if unicodedata.category(char) != "Mn")


# Restored compatibility helpers retained by the Agent test and fallback APIs.
def _restore_query_spelling(original: str, normalized_query: str) -> str:
    """Preserve user spelling while using folded text for intent matching."""
    wanted = plain(normalized_query).split()
    if not wanted:
        return normalized_query
    tokens = re.findall(r"[^\W_]+", original, flags=re.UNICODE)
    folded_tokens = [plain(token) for token in tokens]
    width = len(wanted)
    for index in range(len(folded_tokens) - width + 1):
        if folded_tokens[index : index + width] == wanted:
            return " ".join(tokens[index : index + width])
    return normalized_query

def classify(query: str) -> str:
    text = plain(query)
    # Pharmacy & Medicine intent detection
    if any(
        value in text
        for value in (
            "mua thuoc",
            "dat thuoc",
            "nha thuoc",
            "hieu thuoc",
            "tiem thuoc",
            "panadol",
            "paracetamol",
            "decolgen",
            "berocca",
            "gaviscon",
            "augmentin",
            "strepsils",
            "khau trang",
            "nuoc muoi",
        )
    ):
        return "pharmacy_search"
    # Multi-provider ride comparison
    if any(
        value in text
        for value in (
            "so sanh gia xe",
            "so sanh xe",
            "so sanh grab",
            "so sanh be",
            "so sanh xanh sm",
            "so sanh cac hang xe",
            "gia xe hang nao re",
        )
    ):
        return "compare_rides"
    # Health intent detection
    if any(value in text for value in ("dau bung", "dau da day", "dau dau", "cam lanh", "dau lung")):
        return "healthcare"
    if any(value in text for value in ("bo qua xac nhan", "goi execute", "khieu nai", "chuyen bay", "dat ban")):
        return "out_of_scope"
    if any(value in text for value in ("theo doi", "tracking", "don hang dang")):
        return "track_order"
    if any(value in text for value in ("huy", "huy")):
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
        if any(value in text for value in ("tim", "an gi")) or _dish_query(text):
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
    if any(value in text for value in ("them", "cho vao gio")):
        return "add_to_cart"
    # Discovery language takes precedence over broad polite phrasing such as
    # "cho tôi". Otherwise "gợi ý cho tôi món ăn" is misclassified as
    # add_to_cart and asks for a restaurant/quantity before any menu search.
    if any(
        value in text
        for value in (
            "tim",
            "an gi",
            "mon",
            "nha hang",
            "goi y",
            "gan day",
            "fast food",
            "ga ran",
            "ga chien",
            "hamburger",
            "pizza",
            "dat ga",
        )
    ):
        return "search_food"
    if "toi muon" in text and _dish_query(text):
        return "search_food"
    if any(value in text for value in ("mua", "cho toi", "toi muon")):
        return "add_to_cart"
    if any(value in text for value in ("xem tong", "preview", "xem don")):
        return "preview_order"
    if any(value in text for value in ("chon quan", "chon nha hang")):
        return "select_restaurant"
    if any(
        value in text
        for value in (
            "tim",
            "an gi",
            "mon",
            "nha hang",
            "goi y",
            "gan day",
            "fast food",
            "ga ran",
            "ga chien",
            "hamburger",
            "pizza",
            "dat ga",
        )
    ):
        return "search_food"
    return "general_food_support"

def _dish_query(text: str) -> str | None:
    cleaned = re.sub(r"\b(?:tim|lay|chon|mon|do an|nha hang|cho toi|toi muon|mua|them|dat|an|bat|phan|to)\b", " ", text)
    cleaned = re.sub(r"\b(?:goi y|toi doi|bua toi|an toi|di|giup toi)\b", " ", cleaned)
    cleaned = re.sub(r"\bap ma\b.*$", " ", cleaned)
    cleaned = re.sub(r"\b(?:mot|hai|ba|bon|nam|[1-9][0-9]?)\b", " ", cleaned)
    cleaned = re.sub(r"\b(?:co lon|size lon|size thuong|khong cay|it cay|cay|nha rieng|duoi \d+ nghin)\b", " ", cleaned)
    cleaned = re.split(
        r"\b(?:giao\s+(?:ve|toi)|ship|(?:va|roi)\s+(?:dat|goi)|dat\s+lich|goi\s+xe|da\s+vao\s+gio|da\s+chon\s+vao\s+gio|vao\s+gio)\b",
        cleaned,
        maxsplit=1,
    )[0]
    cleaned = re.sub(r"\b(?:o|tai|khu vuc)\s+[a-z ]+[.!?,;:]*$", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,!?;:")
    if set(cleaned.split()).issubset({"toi", "doi", "goi", "y", "di", "mon", "an", "gi", "bua"}):
        return None
    return cleaned or None

def extract_slots(query: str) -> dict[str, object]:
    text = plain(query)
    slots: dict[str, object] = {}
    quantity = None if re.search(r"\b\d{1,2}\s*(?:h|:|gio|ruoi)\b", text) else re.search(r"\b([1-9][0-9]?)\b", text)
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
        declaration = re.search(
            r"\bdia\s+chi(?:\s+(?:nha|cong\s+ty|giao\s+hang))?(?:\s+(?:cua\s+)?toi)?\s+la\s+(.+?)(?:[.!?,;:]|$)",
            text,
        )
        normalized_address = (
            declaration.group(1).strip()
            if declaration
            else "nha rieng"
            if "nha rieng" in text
            else delivery.group(1).strip()
            if delivery
            else text
        )
        slots["address_query"] = _restore_query_spelling(query, normalized_address)
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
    district = re.search(r"\b(?:o|tai|khu vuc|den)\b\s+([a-z ]+?)(?:\s+(?:duoi|tren|gia)|[.!?,;:]?$)", text)
    if district:
        slots["district"] = district.group(1).strip()
    ride_request = any(value in text for value in ("dat xe", "goi xe", "di tu", "xe tu"))
    if not ride_request and any(
        value in text
        for value in (
            "tim",
            "an gi",
            "mon",
            "lay",
            "chon",
            "cho toi",
            "toi muon",
            "mua",
            "them",
            "dat",
            "goi y",
            "ga ran",
            "ga chien",
            "fast food",
        )
    ):
        dish = _dish_query(text)
        if dish:
            slots["dish_query"] = _restore_query_spelling(query, dish)

    department_match = re.search(r"\bkhoa\s+([a-z ]+)(?:[.!?,;:]|$)", text)
    if department_match:
        slots["department"] = _restore_query_spelling(query, "khoa " + department_match.group(1).strip())

    time_match = re.search(r"\b(\d{1,2}(?:\s*(?:h|:|gio|ruoi))(?:\s*\d{2})?(?:\s*(?:sang|trua|chieu|toi))?)\b", text)
    if time_match:
        slots["time"] = _restore_query_spelling(query, time_match.group(1).strip())

    # Provider extraction across Ride, Food, Restaurant, Pharmacy
    if "grabfood" in text or "grab food" in text:
        slots["provider"] = "grabfood"
    elif "shopeefood" in text or "shopee food" in text:
        slots["provider"] = "shopeefood"
    elif "pasgo" in text:
        slots["provider"] = "pasgo"
    elif "long chau" in text or "fpt long chau" in text or "longchau" in text:
        slots["provider"] = "longchau"
    elif "pharmacity" in text:
        slots["provider"] = "pharmacity"
    elif "xanh sm" in text or "xanhsm" in text or "vinfast" in text:
        slots["provider"] = "xanhsm"
    elif "grab" in text:
        slots["provider"] = "grab"
    elif "be" in text.split() or " be " in f" {text} " or "xe be" in text:
        slots["provider"] = "be"

    # Medication extraction
    for med in (
        "panadol extra",
        "panadol",
        "paracetamol",
        "decolgen",
        "berocca",
        "gaviscon",
        "augmentin",
        "strepsils",
        "khau trang",
        "nuoc muoi",
    ):
        if med in text:
            slots["medication_name"] = _restore_query_spelling(query, med)
            break

    return slots
