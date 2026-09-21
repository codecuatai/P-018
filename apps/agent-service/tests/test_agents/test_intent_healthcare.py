from src.agents.intent import classify


def test_classify_healthcare_with_diacritics():
    # Because intent.py uses plain(), diacritics are removed before matching
    # The keywords inside intent.py have been updated to be without diacritics.
    assert classify("tôi bị đau bụng") == "healthcare"
    assert classify("đau dạ dày quá") == "healthcare"
    assert classify("bị đau đầu") == "healthcare"
    assert classify("tôi bị cảm lạnh") == "healthcare"
    assert classify("đau lưng quá") == "healthcare"


def test_classify_food_pure():
    assert classify("tôi muốn ăn gà rán") == "search_food"
    assert classify("pizza ngon") == "search_food"


def test_classify_pharmacy_and_ride_compare():
    assert classify("tôi muốn mua thuốc panadol") == "pharmacy_search"
    assert classify("tìm nhà thuốc gần đây") == "pharmacy_search"
    assert classify("mua vỉ decolgen giao tận nơi") == "pharmacy_search"
    assert classify("so sánh giá xe grab và be") == "compare_rides"
    assert classify("so sánh xe từ VinUni về Hồ Gươm") == "compare_rides"


def test_extract_provider_and_medication_slots():
    from src.agents.intent import extract_slots

    slots_grab = extract_slots("đặt xe grab từ VinUni về Bách Khoa")
    assert slots_grab.get("provider") == "grab"

    slots_be = extract_slots("gọi xe be đi chơi")
    assert slots_be.get("provider") == "be"

    slots_xanhsm = extract_slots("đặt xe Xanh SM từ Times City")
    assert slots_xanhsm.get("provider") == "xanhsm"

    slots_food = extract_slots("tìm bún chả trên ShopeeFood")
    assert slots_food.get("provider") == "shopeefood"

    slots_food_grab = extract_slots("đặt gà rán GrabFood")
    assert slots_food_grab.get("provider") == "grabfood"

    slots_pasgo = extract_slots("đặt bàn PasGo 4 người")
    assert slots_pasgo.get("provider") == "pasgo"

    slots_pharmacy = extract_slots("mua thuốc Panadol Extra ở Long Châu")
    assert slots_pharmacy.get("provider") == "longchau"
    assert "panadol" in str(slots_pharmacy.get("medication_name")).lower()

    slots_pharmacity = extract_slots("mua paracetamol ở Pharmacity")
    assert slots_pharmacity.get("provider") == "pharmacity"
    assert "paracetamol" in str(slots_pharmacity.get("medication_name")).lower()

