"""Comprehensive 1,000 Cases Stress Test & Evaluation for X-One Agent.

This script programmatically generates 1,000 realistic Vietnamese user prompts across:
1. Ride (250 cases)
2. Food (250 cases)
3. Restaurant (200 cases)
4. Healthcare (150 cases)
5. Chitchat & Unsupported / Out-of-Scope (100 cases)
6. Multi-service DAG workflows (50 cases)

It executes them against the Agent Engine, records decisions, identifies exact
failure patterns (e.g., substring collisions, slot extraction gaps), and computes
accuracy rates by domain.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
AGENT_ROOT = ROOT / "apps" / "agent-service"
sys.path.insert(0, str(AGENT_ROOT))

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SERVICE_PORT", "8100")
os.environ.setdefault("DATABASE_URL", "postgresql://deterministic:deterministic@localhost/test")
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "deterministic-test-token")
os.environ.setdefault("AGENT_MODEL_MODE", "deterministic")
os.environ.setdefault("AGENT_PERSISTENCE_MODE", "memory")

from src.agents.assistant_graph import _typed_pipeline_result, deterministic_plan


def generate_1000_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []

    # 1. RIDE CASES (250)
    origins = [
        "sân bay Nội Bài", "Vincom Bà Triệu", "Cầu Giấy", "Hồ Gươm", "bến xe Mỹ Đình",
        "Đại học Bách Khoa", "Keangnam Landmark", "Times City", "Royal City", "Hồ Tây",
        "bến xe Giáp Bát", "bệnh viện Bạch Mai", "Phố Cổ", "Trần Duy Hưng", "Nguyễn Trãi",
        "Lê Văn Lương", "Đống Đa", "Hai Bà Trưng", "Hoàn Kiếm", "Hà Đông"
    ]
    destinations = [
        "phố cổ Hà Nội", "Vincom Center Cầu Giấy", "Aeon Mall Long Biên", "Lotte Mall Tây Hồ",
        "Ga Hà Nội", "Nhà Hát Lớn", "Hồ Trúc Bạch", "Chợ Đồng Xuân", "Khu đô thị Ciputra",
        "Ecopark", "Bệnh viện Việt Đức", "Đại học Quốc Gia", "Vinhomes Smart City",
        "Ocean Park", "Linh Đàm", "Kim Mã", "Hoàng Hoa Thám", "Thụy Khuê", "Đội Cấn", "Xuân Thủy"
    ]
    vehicles = ["xe máy", "ô tô 4 chỗ", "xe 7 chỗ", "bike", "car 4", "car 7", "xe ôm", "taxi"]
    ride_templates = [
        "Đặt {veh} từ {orig} đến {dest} cho mình.",
        "Gọi giúp tôi một chuyến {veh} đi từ {orig} sang {dest}.",
        "Mình muốn đi từ {orig} qua {dest}, giá {veh} khoảng bao nhiêu?",
        "Book xe đón ở {orig} trả khách tại {dest}, loại {veh} nhé.",
        "Cho một cuốc {veh} từ {orig} tới {dest} ngay bây giờ.",
        "Từ {orig} ra {dest} có {veh} không, tính cước giúp tôi.",
        "Tôi cần đi gấp từ {orig} về {dest}, đặt {veh} nhé.",
        "Đặt xe từ {orig} ghé qua {dest}, chọn {veh}.",
        "Đón tôi tại {orig} và chở tới {dest} bằng {veh}.",
        "Cần tìm một xe {veh} đi từ {orig} tới {dest} lúc 18h."
    ]

    count = 0
    for i in range(250):
        orig = origins[i % len(origins)]
        dest = destinations[(i * 3 + 1) % len(destinations)]
        veh = vehicles[(i * 2) % len(vehicles)]
        tmpl = ride_templates[i % len(ride_templates)]
        text = tmpl.format(orig=orig, dest=dest, veh=veh)
        cases.append({
            "id": f"ride_{i+1:03d}",
            "domain": "ride",
            "expected_capability": "ride.quote.create",
            "text": text,
        })

    # 2. FOOD CASES (250)
    dishes = [
        "cơm sườn bì chả", "phở bò tái chín", "bún chả Hà Nội", "bún đậu mắm tôm",
        "gà rán sốt cay", "trà sữa trân châu đường đen", "bánh mì pate xúc xích",
        "pizza hải sản", "mì cay Hàn Quốc cấp 3", "chè sầu riêng", "cơm gà xối mỡ",
        "bún bò Huế", "hủ tiếu Nam Vang", "cơm rang dưa bò", "bánh cuốn nóng",
        "nem lụi nướng", "trà đào cam sả", "cà phê muối", "matcha latte", "sữa chua trân châu"
    ]
    food_locs = [
        "giao về số 12 Tràng Thi", "ship tới Keangnam Landmark", "giao qua toà nhà FPT Cầu Giấy",
        "mang tới ngõ 105 Doãn Kế Thiện", "giao về chung cư Mandarin Garden", "ship đến 45 Bà Triệu",
        "giao cho tôi ở 88 Láng Hạ", "ship gấp đến Đại học Ngoại Thương", "giao về Vincom Bà Triệu",
        "mang đến toà nhà Landmark 72"
    ]
    food_templates = [
        "Đặt cho mình 2 suất {dish}, {loc}.",
        "Tìm quán bán {dish} ngon nhất rồi {loc} nhé.",
        "Tôi muốn gọi {dish}, {loc}.",
        "Ship cho tôi 1 phần {dish}, {loc}.",
        "Giao giúp mình món {dish}, địa chỉ {loc}.",
        "Thèm ăn {dish} quá, tìm quán nào đang mở và {loc}.",
        "Menu nào có {dish} giá tốt không, {loc} nhé.",
        "Đặt đồ ăn trưa: 3 phần {dish}, {loc}.",
        "Gọi giúp tôi {dish}, ghi chú ít ngọt/không cay, {loc}.",
        "Tối nay muốn ăn {dish}, tìm quán gần đây {loc}."
    ]

    for i in range(250):
        dish = dishes[i % len(dishes)]
        loc = food_locs[(i * 2 + 1) % len(food_locs)]
        tmpl = food_templates[i % len(food_templates)]
        text = tmpl.format(dish=dish, loc=loc)
        cases.append({
            "id": f"food_{i+1:03d}",
            "domain": "food",
            "expected_capability": "search_food",
            "text": text,
        })

    # 3. RESTAURANT CASES (200)
    cuisines = [
        "lẩu nướng BBQ", "hải sản tươi sống", "đồ ăn Nhật Bản Sushi", "món Ý Pizza Pasta",
        "ẩm thực chay thanh tịnh", "lẩu bò nhúng dấm", "đồ nướng Hàn Quốc", "món Thái cay nồng",
        "ẩm thực cung đình Huế", "bít tết bò Mỹ Wagyu"
    ]
    districts = ["quận Hoàn Kiếm", "quận Cầu Giấy", "quận Ba Đình", "quận Tây Hồ", "quận Hai Bà Trưng", "quận Đống Đa"]
    times = ["lúc 19h tối nay", "12h trưa mai", "18h30 thứ 7 này", "20h tối", "11h30 trưa nay"]
    rest_templates = [
        "Đặt bàn tại nhà hàng {cui} ở {dist} cho {p} người {t}.",
        "Tìm giúp tôi nhà hàng {cui} khu vực {dist}, cần giữ bàn {p} khách {t}.",
        "Tôi muốn đặt chỗ ăn tối tại nhà hàng {cui} quanh {dist}, đi {p} người {t}.",
        "Có nhà hàng {cui} nào còn bàn trống ở {dist} {t} không? Chúng tôi có {p} người.",
        "Giữ chỗ cho tôi một bàn {p} người ở nhà hàng {cui} {dist} {t} nhé."
    ]

    for i in range(200):
        cui = cuisines[i % len(cuisines)]
        dist = districts[(i * 2) % len(districts)]
        t = times[(i * 3) % len(times)]
        p = (i % 8) + 2
        tmpl = rest_templates[i % len(rest_templates)]
        text = tmpl.format(cui=cui, dist=dist, t=t, p=p)
        cases.append({
            "id": f"rest_{i+1:03d}",
            "domain": "restaurant",
            "expected_capability": "restaurant.search",
            "text": text,
        })

    # 4. HEALTHCARE CASES (150)
    departments = [
        "da liễu", "tim mạch", "nhi khoa", "tai mũi họng", "cơ xương khớp",
        "tiêu hóa", "thần kinh", "mắt", "nội tổng quát", "răng hàm mặt"
    ]
    doctors = ["bác sĩ chuyên khoa", "bác sĩ đầu ngành", "thạc sĩ bác sĩ", "bác sĩ giỏi", "trưởng khoa"]
    dates = ["sáng mai", "chiều nay", "sáng thứ Hai tới", "ngày mai lúc 9h", "chiều thứ Năm"]
    health_templates = [
        "Đặt lịch khám {dep} với {doc} vào {d} giúp tôi.",
        "Tôi muốn khám bệnh chuyên khoa {dep}, có lịch trống {d} không?",
        "Đăng ký khám {dep} cho người nhà vào {d}, tìm {doc}.",
        "Tìm bác sĩ {dep} giỏi và đặt lịch hẹn khám vào {d}.",
        "Tôi bị đau đầu và mệt mỏi, muốn đặt lịch khám {dep} {d}."
    ]

    for i in range(150):
        dep = departments[i % len(departments)]
        doc = doctors[i % len(doctors)]
        d = dates[(i * 2) % len(dates)]
        tmpl = health_templates[i % len(health_templates)]
        text = tmpl.format(dep=dep, doc=doc, d=d)
        cases.append({
            "id": f"health_{i+1:03d}",
            "domain": "healthcare",
            "expected_capability": "healthcare.list_departments",
            "text": text,
        })

    # 5. CHITCHAT & OUT-OF-SCOPE CASES (100)
    chitchat_texts = [
        "Xin chào bạn, hôm nay bạn thế nào?",
        "Bạn là ai và bạn có thể làm được những gì?",
        "Thời tiết Hà Nội hôm nay có mưa không bạn?",
        "Kể cho tôi nghe một câu chuyện cười đi.",
        "Cảm ơn bạn nhiều nhé, dịch vụ rất tốt!",
        "Hôm nay tâm trạng tôi không vui, trò chuyện cùng tôi nhé.",
        "Ai tạo ra bạn vậy?",
        "Tạm biệt nhé, hẹn gặp lại sau.",
        "Bạn có biết nấu ăn không?",
        "Chúc bạn một ngày làm việc vui vẻ!"
    ]
    unsupported_texts = [
        "Viết giúp tôi một đoạn mã Python kết nối PostgreSQL.",
        "Giải phương trình bậc hai: x^2 - 5x + 6 = 0.",
        "Làm giúp tôi bài văn phân tích tác phẩm Truyện Kiều.",
        "Quan điểm của bạn về tình hình chính trị quốc tế hiện nay là gì?",
        "Hướng dẫn tôi cách sửa card màn hình máy tính bị sập nguồn.",
        "Viết một bài thơ tình lãng mạn tặng người yêu.",
        "Cách hack tài khoản Facebook như thế nào?",
        "Dạy tôi học lập trình C++ từ cơ bản đến nâng cao.",
        "Dịch đoạn văn tiếng Anh này sang tiếng Pháp giúp tôi.",
        "Cổ phiếu nào tiềm năng nhất thị trường chứng khoán ngày mai?"
    ]

    for i in range(50):
        cases.append({
            "id": f"chitchat_{i+1:03d}",
            "domain": "chitchat",
            "expected_capability": "assistant.chat",
            "text": chitchat_texts[i % len(chitchat_texts)],
        })
    for i in range(50):
        cases.append({
            "id": f"unsupported_{i+1:03d}",
            "domain": "unsupported",
            "expected_capability": "assistant.chat",
            "text": unsupported_texts[i % len(unsupported_texts)],
        })

    # 6. MULTI-SERVICE WORKFLOW CASES (50)
    multi_templates = [
        "Tìm nhà hàng lẩu hải sản ở Cầu Giấy lúc 19h rồi đặt xe 4 chỗ đón tôi từ Hồ Gươm qua đó.",
        "Đặt lịch khám da liễu sáng mai tại bệnh viện rồi gọi xe máy đưa tôi tới viện.",
        "Đặt 2 suất cơm gà giao về nhà ở Vincom Bà Triệu và tìm một cuốc xe máy đi Cầu Giấy.",
        "Tìm quán nướng BBQ ở Hoàn Kiếm cho 4 người tối nay và đặt xe 7 chỗ đưa cả nhóm đi.",
        "Đăng ký khám tim mạch vào 9h sáng mai rồi chuẩn bị sẵn chuyến xe đón ở Times City."
    ]
    for i in range(50):
        cases.append({
            "id": f"multi_{i+1:03d}",
            "domain": "multi_service",
            "expected_capability": "multi_task",
            "text": multi_templates[i % len(multi_templates)],
        })

    return cases


def run_benchmark() -> dict[str, Any]:
    cases = generate_1000_cases()
    assert len(cases) == 1000, f"Expected 1000 cases, got {len(cases)}"

    stats = {
        "total": len(cases),
        "passed": 0,
        "failed": 0,
        "by_domain": defaultdict(lambda: {"total": 0, "passed": 0, "failed": 0}),
        "failure_patterns": Counter(),
        "sample_failures": [],
    }

    start_time = time.perf_counter()

    for c in cases:
        inp = c["text"]
        expected_dom = c["domain"]
        expected_cap = c["expected_capability"]

        stats["by_domain"][expected_dom]["total"] += 1

        decision = _typed_pipeline_result(
            deterministic_plan(inp), {}, "deterministic"
        )["planning_decision"]

        tasks = decision.get("tasks", [])
        interaction_mode = decision.get("interaction_mode", "service")

        steps = [s for t in tasks for s in t.get("steps", []) if s.get("capability")]
        actual_cap = steps[0]["capability"] if steps else "assistant.chat"
        actual_domains = [t.get("domain") for t in tasks]

        # Evaluation criteria
        is_pass = False
        if expected_dom == "ride":
            is_pass = "ride" in actual_domains and actual_cap == "ride.quote.create"
        elif expected_dom == "food":
            is_pass = "food" in actual_domains and actual_cap == "search_food"
        elif expected_dom == "restaurant":
            is_pass = "restaurant" in actual_domains and actual_cap == "restaurant.search"
        elif expected_dom == "healthcare":
            is_pass = "healthcare" in actual_domains and actual_cap == "healthcare.list_departments"
        elif expected_dom == "chitchat":
            is_pass = (len(tasks) == 0 and interaction_mode in {"chitchat", "advisory", "service"})
        elif expected_dom == "unsupported":
            is_pass = (len(tasks) == 0 and interaction_mode == "unsupported")
        elif expected_dom == "multi_service":
            is_pass = len(tasks) >= 2

        if is_pass:
            stats["passed"] += 1
            stats["by_domain"][expected_dom]["passed"] += 1
        else:
            stats["failed"] += 1
            stats["by_domain"][expected_dom]["failed"] += 1

            # Categorize failure reason
            pattern = "UNKNOWN"
            if expected_dom == "ride" and "food" in actual_domains:
                pattern = "RIDE_TRIGGERED_FOOD (Substring collision e.g. Vincom/pho/bun/dia)"
            elif expected_dom == "ride" and len(tasks) == 0:
                pattern = "RIDE_SLOT_EXTRACTION_FAILURE (Failed to extract pickup/dropoff)"
            elif expected_dom == "food" and len(tasks) == 0:
                pattern = "FOOD_DISH_EXTRACTION_FAILURE"
            elif expected_dom == "food" and "restaurant" in actual_domains:
                pattern = "FOOD_COLLIDED_WITH_RESTAURANT"
            elif expected_dom == "restaurant" and len(tasks) == 0:
                pattern = "RESTAURANT_EXTRACTION_FAILURE"
            elif expected_dom == "healthcare" and len(tasks) == 0:
                pattern = "HEALTHCARE_KEYWORD_MISSED"
            elif expected_dom == "unsupported" and interaction_mode != "unsupported":
                pattern = "OUT_OF_SCOPE_NOT_REJECTED"
            elif expected_dom == "multi_service" and len(tasks) < 2:
                pattern = "MULTI_SERVICE_DECOMPOSED_INCOMPLETE"

            stats["failure_patterns"][pattern] += 1
            if len(stats["sample_failures"]) < 20:
                stats["sample_failures"].append({
                    "id": c["id"],
                    "domain": expected_dom,
                    "text": inp,
                    "actual_domains": actual_domains,
                    "actual_cap": actual_cap,
                    "interaction_mode": interaction_mode,
                    "pattern": pattern,
                })

    elapsed = time.perf_counter() - start_time
    stats["elapsed_seconds"] = round(elapsed, 3)
    stats["accuracy_overall"] = round(stats["passed"] / stats["total"] * 100, 2)

    for dom, dstat in stats["by_domain"].items():
        dstat["accuracy"] = round(dstat["passed"] / dstat["total"] * 100, 2)

    return stats


if __name__ == "__main__":
    report = run_benchmark()
    print("=" * 70)
    print("        BÁO CÁO KIỂM THỬ ÁP LỰC 1,000 TEST CASES (X-ONE AGENT)")
    print("=" * 70)
    print(f"Tổng số ca kiểm thử: {report['total']}")
    print(f"Thời gian chạy:       {report['elapsed_seconds']} giây")
    print(f"Số ca THÀNH CÔNG:     {report['passed']} ({report['accuracy_overall']}%)")
    print(f"Số ca THẤT BẠI:       {report['failed']} ({round(100 - report['accuracy_overall'], 2)}%)")
    print("-" * 70)
    print("CHI TIẾT THEO TỪNG MIỀN NGHIỆP VỤ:")
    for dom, dstat in sorted(report["by_domain"].items()):
        print(f" - {dom:<15}: {dstat['passed']}/{dstat['total']:<4} ({dstat['accuracy']}%)")
    print("-" * 70)
    print("CÁC MẪU LỖI NGUYÊN NHÂN HÀNG ĐẦU (TOP FAILURE PATTERNS):")
    for pat, count in report["failure_patterns"].most_common(10):
        print(f" • [{count:3d} ca] {pat}")
    print("=" * 70)
