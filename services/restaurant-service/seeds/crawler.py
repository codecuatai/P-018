import json
import os
import random
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from sqlalchemy import select
from src.infrastructure.database import OpeningHourRow, RestaurantRow, TableRow, make_session_factory

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Bounding box around Hanoi center (Hoan Kiem, Ba Dinh, Tay Ho, Hai Ba Trưng)
# format: (min_lat, min_lon, max_lat, max_lon)
HANOI_BBOX = "21.00,105.78,21.06,105.86"

# Fallback Unsplash images based on cuisine type
FALLBACK_IMAGES = {
    "vietnamese": "https://images.unsplash.com/photo-1596797038530-2c107229654b?q=80&w=600",
    "japanese": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=600",
    "korean": "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?q=80&w=600",
    "italian": "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=600",
    "french": "https://images.unsplash.com/photo-1502085680191-033146036895?q=80&w=600",
    "indian": "https://images.unsplash.com/photo-1585938338392-50a59970d8ee?q=80&w=600",
    "thai": "https://images.unsplash.com/photo-1559314809-0d155014e29e?q=80&w=600",
    "default": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=600"
}

# Fallback descriptions based on cuisine type
FALLBACK_DESCRIPTIONS = {
    "vietnamese": "Không gian ấm cúng chuyên phục vụ các món ăn truyền thống Việt Nam chuẩn vị, đậm đà bản sắc quê hương.",
    "japanese": "Trải nghiệm tinh hoa ẩm thực Nhật Bản với nguyên liệu tươi ngon được chọn lọc kỹ càng mỗi ngày.",
    "korean": "Địa điểm lý tưởng cho các buổi tụ họp gia đình và bạn bè với các món nướng và lẩu đặc sắc chuẩn Hàn.",
    "italian": "Thưởng thức pizza nướng củi thủ công và mì Ý tươi chuẩn vị trong không gian lãng mạn đậm chất Âu.",
    "french": "Không gian ẩm thực Pháp sang trọng, tinh tế cùng thực đơn phong phú kết hợp các loại rượu vang thượng hạng.",
    "default": "Nhà hàng phục vụ ẩm thực đa dạng, không gian thoáng mát, dịch vụ đặt bàn chuyên nghiệp và tận tâm."
}

# List of Overpass API mirrors for fallback (focusing on global and Asian servers)
OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.rambler.ru/cgi/interpreter",
    "https://overpass.swetour.ru/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
]

def fetch_osm_restaurants():
    """Fetch restaurant nodes and ways from OpenStreetMap via Overpass API mirrors."""
    import time
    print("--- 1. Đang lấy dữ liệu từ OpenStreetMap (Overpass API) ---")
    query = f"""
    [out:json][timeout:120];
    (
      node["amenity"="restaurant"]({HANOI_BBOX});
      way["amenity"="restaurant"]({HANOI_BBOX});
    );
    out center;
    """

    query_encoded = urllib.parse.quote(query.strip())

    for endpoint in OVERPASS_ENDPOINTS:
        url = f"{endpoint}?data={query_encoded}"
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
            }
        )

        # Thử kết nối tối đa 2 lần cho mỗi mirror nếu bị timeout
        for attempt in range(1, 3):
            print(f"Thử kết nối tới Overpass mirror: {endpoint} (Lần thử {attempt}/2)...")
            try:
                with urllib.request.urlopen(req, timeout=60) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    elements = result.get('elements', [])
                    if len(elements) > 0:
                        print(f"Thành công! Tìm thấy {len(elements)} địa điểm từ OSM.")
                        return elements
                    else:
                        print(f"   -> Mirror {endpoint} trả về 0 kết quả.")
                        break # Chuyển sang mirror tiếp theo ngay, không cần retry nếu 0 kết quả
            except Exception as e:
                print(f"   -> Lỗi kết nối ({e})")
                if attempt < 2:
                    time.sleep(2)
                continue

    print("Tất cả các Overpass API mirrors đều thất bại hoặc trả về 0 kết quả.")
    return []

def scrape_website_metadata(url):
    """Scrape description and image URL from the restaurant's website."""
    if not url:
        return None, None

    if not url.startswith(('http://', 'https://')):
        url = 'http://' + url

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=3) as response:
            html = response.read().decode('utf-8', errors='ignore')

            # 1. Trích xuất Schema JSON-LD (Restaurant) nếu có
            json_ld_matches = re.findall(r'<script\s+[^>]*?type=["\']application/ld\+json["\'][^>]*?>(.*?)</script>', html, re.DOTALL)
            for json_str in json_ld_matches:
                try:
                    data = json.loads(json_str.strip())
                    if isinstance(data, list):
                        data = data[0] if data else {}
                    if isinstance(data, dict) and data.get('@type') in ['Restaurant', 'FoodEstablishment']:
                        desc = data.get('description')
                        img = data.get('image')
                        if isinstance(img, list) and img:
                            img = img[0]
                        if isinstance(img, dict) and 'url' in img:
                            img = img['url']
                        if desc or img:
                            return desc, img
                except Exception:
                    continue

            # 2. Trích xuất Meta Open Graph tags
            desc_match = re.search(r'<meta[^>]+?property=["\']og:description["\'][^>]+?content=["\']([^"\']+)["\']', html)
            if not desc_match:
                desc_match = re.search(r'<meta[^>]+?content=["\']([^"\']+)["\'][^>]+?property=["\']og:description["\']', html)

            img_match = re.search(r'<meta[^>]+?property=["\']og:image["\'][^>]+?content=["\']([^"\']+)["\']', html)
            if not img_match:
                img_match = re.search(r'<meta[^>]+?content=["\']([^"\']+)["\'][^>]+?property=["\']og:image["\']', html)

            desc = desc_match.group(1) if desc_match else None
            img = img_match.group(1) if img_match else None

            if desc or img:
                return desc, img

            # 3. Fallback lấy thẻ meta description tiêu chuẩn
            std_desc_match = re.search(r'<meta[^>]+?name=["\']description["\'][^>]+?content=["\']([^"\']+)["\']', html)
            if not std_desc_match:
                std_desc_match = re.search(r'<meta[^>]+?content=["\']([^"\']+)["\'][^>]+?name=["\']description["\']', html)
            desc = std_desc_match.group(1) if std_desc_match else None

            return desc, img
    except Exception:
        pass
    return None, None

def parse_opening_hours(hours_str):
    """Parse OSM opening_hours string into structured weekday times (opens_at, closes_at)."""
    default_hours = [{"weekday": i, "opens_at": "08:00", "closes_at": "22:00"} for i in range(7)]

    if not hours_str:
        return default_hours

    hours_str = hours_str.strip()
    if hours_str == "24/7":
        return [{"weekday": i, "opens_at": "00:00", "closes_at": "23:59"} for i in range(7)]

    time_match = re.search(r'(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})', hours_str)
    if not time_match:
        return default_hours

    opens, closes = time_match.groups()
    parsed_hours = []
    for i in range(7):
        parsed_hours.append({
            "weekday": i,
            "opens_at": opens,
            "closes_at": closes
        })
    return parsed_hours

def get_address_details(tags):
    """Extract full address, ward, district, and city from OSM tags or parse them from full text."""
    city = tags.get('addr:city') or tags.get('addr:province') or "Hà Nội"
    district = tags.get('addr:district') or tags.get('addr:suburb') or ""
    ward = tags.get('addr:ward') or tags.get('addr:subdistrict') or ""

    street = tags.get('addr:street') or ""
    housenumber = tags.get('addr:housenumber') or ""
    street_address = f"{housenumber} {street}".strip() if housenumber else street

    parts = [p.strip() for p in [street_address, ward, district, city] if p]
    address = ", ".join(parts) if parts else (tags.get('addr:full') or "Hà Nội, Việt Nam")

    # Fallback: Nếu thiếu ward/district nhưng address full có định dạng phân cách dấu phẩy
    if not ward or not district:
        addr_parts = [x.strip() for x in address.split(',')]
        if len(addr_parts) >= 4:
            if not city:
                city = addr_parts[-1]
            if not district:
                district = addr_parts[-2]
            if not ward:
                ward = addr_parts[-3]
        elif len(addr_parts) == 3:
            if not city:
                city = addr_parts[-1]
            if not district:
                district = addr_parts[-2]

    city = city.strip()
    district = district.strip()
    ward = ward.strip()

    return address, ward, district, city

def write_files(crawled_list):
    """Save crawled list to JSON and CSV files (merging with existing file content)."""
    if not crawled_list:
        return

    output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "crawled_restaurants.json")
    try:
        existing_data = []
        if os.path.exists(output_path):
            try:
                with open(output_path, encoding="utf-8") as f:
                    existing_data = json.load(f)
            except Exception:
                pass

        combined_map = {item["source_id"]: item for item in existing_data}
        for item in crawled_list:
            combined_map[item["source_id"]] = item

        combined_list = list(combined_map.values())

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(combined_list, f, ensure_ascii=False, indent=2)
        print(f"Đã xuất/hợp nhất file JSON thành công tại: {output_path} (Tổng cộng: {len(combined_list)} bản ghi)")
    except Exception as e:
        print(f"Lỗi khi lưu file JSON: {e}")
        return

    # 5. Xuất file CSV cục bộ (Đầy đủ 21 cột lý tưởng)
    csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "crawled_restaurants.csv")
    try:
        import csv
        fieldnames = [
            "source_id", "name", "address", "ward", "district", "city",
            "latitude", "longitude", "cuisine_type", "cuisine_tags", "description",
            "phone", "website", "opening_hours", "rating", "review_count",
            "price_level", "image_url", "source_name", "source_url", "fetched_at"
        ]
        with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for item in combined_list:
                row = item.copy()

                if isinstance(row.get("cuisine_tags"), list):
                    row["cuisine_tags"] = ", ".join(row["cuisine_tags"])

                if isinstance(row.get("opening_hours"), dict):
                    row["opening_hours"] = json.dumps(row["opening_hours"], ensure_ascii=False)

                filtered_row = {k: v for k, v in row.items() if k in fieldnames}
                # Loại bỏ ký tự xuống dòng trong trường description để tránh vỡ dòng vật lý trong file CSV
                if filtered_row.get("description"):
                    filtered_row["description"] = filtered_row["description"].replace("\r\n", " ").replace("\n", " ").strip()
                writer.writerow(filtered_row)
        print(f"Đã xuất/hợp nhất file CSV thành công tại: {csv_path} (Tổng cộng: {len(combined_list)} dòng)")
    except Exception as e:
        print(f"Lỗi khi lưu file CSV: {e}")

def export_from_db(factory):
    """Fallback: Query all existing records in PostgreSQL and write them to JSON/CSV files."""
    import html
    print("\n--- Đang tiến hành xuất file JSON/CSV dự phòng trực tiếp từ Cơ sở dữ liệu ---")
    crawled_list = []

    with factory() as db:
        restaurants = db.scalars(select(RestaurantRow)).all()
        print(f"Tìm thấy {len(restaurants)} nhà hàng trong DB. Đang chuẩn hóa...")
        for rest in restaurants:
            # Query opening hours
            ohs = db.scalars(select(OpeningHourRow).where(OpeningHourRow.restaurant_id == rest.id)).all()
            oh_dict = {
                "monday": {"opens_at": "08:00", "closes_at": "22:00"},
                "tuesday": {"opens_at": "08:00", "closes_at": "22:00"},
                "wednesday": {"opens_at": "08:00", "closes_at": "22:00"},
                "thursday": {"opens_at": "08:00", "closes_at": "22:00"},
                "friday": {"opens_at": "08:00", "closes_at": "22:00"},
                "saturday": {"opens_at": "08:00", "closes_at": "22:00"},
                "sunday": {"opens_at": "08:00", "closes_at": "22:00"}
            }
            weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            for oh in ohs:
                if 0 <= oh.weekday < 7:
                    oh_dict[weekdays[oh.weekday]] = {
                        "opens_at": oh.opens_at,
                        "closes_at": oh.closes_at
                    }

            # Phân tách địa chỉ cơ bản
            address = html.unescape(rest.location)
            ward, district, city = "", "", "Hà Nội"
            addr_parts = [x.strip() for x in address.split(',')]
            if len(addr_parts) >= 4:
                city = addr_parts[-1]
                district = addr_parts[-2]
                ward = addr_parts[-3]
            elif len(addr_parts) == 3:
                city = addr_parts[-1]
                district = addr_parts[-2]

            # Đọc lại metadata
            desc = html.unescape(rest.description or "")
            name = html.unescape(rest.name)

            crawled_list.append({
                "source_id": rest.id.replace("rest-osm-", "osm_"),
                "name": name,
                "address": address,
                "ward": ward,
                "district": district,
                "city": city,
                "latitude": 21.0285, # Default coordinates for export
                "longitude": 105.8048,
                "cuisine_type": rest.cuisine_type,
                "cuisine_tags": [rest.cuisine_type],
                "description": desc,
                "phone": "Chưa cập nhật",
                "website": "",
                "opening_hours": oh_dict,
                "rating": rest.rating,
                "review_count": random.randint(10, 100),
                "price_level": rest.budget_range,
                "image_url": rest.image_url or "",
                "source_name": "OpenStreetMap",
                "source_url": f"https://www.openstreetmap.org/node/{rest.id.replace('rest-osm-', '')}",
                "fetched_at": datetime.now().isoformat()
            })

    write_files(crawled_list)
    print("Hoàn tất xuất file từ DB.")

def main():
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("RESTAURANT_DATABASE_URL") or "sqlite:///./.test-restaurant.db"
    print(f"Sử dụng Database URL: {db_url}")

    factory = make_session_factory(db_url)

    # 1. Fetch raw data
    osm_elements = fetch_osm_restaurants()
    if not osm_elements:
        print("Không thể lấy dữ liệu từ OSM. Chuyển sang chế độ xuất file dự phòng từ DB.")
        export_from_db(factory)
        return

    total_count = len(osm_elements)
    print(f"Bắt đầu xử lý TOÀN BỘ {total_count} nhà hàng từ OSM...")

    # 2. Thu thập danh sách website độc nhất để quét song song
    websites_to_scrape = set()
    for element in osm_elements:
        tags = element.get('tags', {})
        web = tags.get('website') or tags.get('contact:website')
        if web:
            websites_to_scrape.add(web)

    websites_list = list(websites_to_scrape)
    print(f"Tìm thấy {len(websites_list)} nhà hàng có trường website. Tiến hành quét song song...")

    web_metadata_map = {}

    def worker(url):
        desc, img = scrape_website_metadata(url)
        return url, desc, img

    with ThreadPoolExecutor(max_workers=25) as executor:
        results = executor.map(worker, websites_list)
        for idx, (url, desc, img) in enumerate(results, 1):
            if desc or img:
                web_metadata_map[url] = (desc, img)
            if idx % 20 == 0 or idx == len(websites_list):
                print(f"   Quét website: Đã hoàn thành {idx}/{len(websites_list)} trang web...")

    crawled_list = []
    inserted_count = 0
    skipped_count = 0

    # 3. Chuẩn hóa và chuẩn bị nạp DB + export
    import html
    print("\n--- 2. Tiến hành chuẩn hóa và nạp dữ liệu vào Database ---")
    with factory() as db:
        for idx, element in enumerate(osm_elements, 1):
            tags = element.get('tags', {})
            osm_id = element.get('id')
            rest_id = f"rest-osm-{osm_id}"

            name = tags.get('name') or f"Nhà hàng OSM #{osm_id}"
            name = html.unescape(name)
            address, ward, district, city = get_address_details(tags)
            address = html.unescape(address)

            # Map cuisine
            raw_cuisine = tags.get('cuisine', '').lower()
            cuisine_type = "vietnamese"
            for key in FALLBACK_IMAGES.keys():
                if key in raw_cuisine:
                    cuisine_type = key
                    break

            website = tags.get('website') or tags.get('contact:website')
            desc, img = None, None
            if website and website in web_metadata_map:
                desc, img = web_metadata_map[website]

            if desc:
                desc = html.unescape(desc)
            if not desc:
                desc = FALLBACK_DESCRIPTIONS.get(cuisine_type, FALLBACK_DESCRIPTIONS["default"])
            if not img:
                img = FALLBACK_IMAGES.get(cuisine_type, FALLBACK_IMAGES["default"])

            phone = tags.get('phone') or tags.get('contact:phone') or "Chưa cập nhật"
            budget_range = random.choice(["$", "$$", "$$$"])
            rating = round(random.uniform(4.0, 4.9), 1)

            opening_hours_raw = tags.get('opening_hours')
            opening_hours_parsed = parse_opening_hours(opening_hours_raw)

            # Lưu vào danh sách crawled_list
            lat = element.get('lat') or element.get('center', {}).get('lat')
            lon = element.get('lon') or element.get('center', {}).get('lon')

            crawled_list.append({
                "source_id": f"osm_{osm_id}",
                "name": name,
                "address": address,
                "ward": ward,
                "district": district,
                "city": city,
                "latitude": lat,
                "longitude": lon,
                "cuisine_type": cuisine_type,
                "cuisine_tags": [cuisine_type] + ([raw_cuisine] if raw_cuisine and raw_cuisine != cuisine_type else []),
                "description": desc,
                "phone": phone,
                "website": website or "",
                "opening_hours": {
                    "monday": {"opens_at": opening_hours_parsed[0]["opens_at"], "closes_at": opening_hours_parsed[0]["closes_at"]},
                    "tuesday": {"opens_at": opening_hours_parsed[1]["opens_at"], "closes_at": opening_hours_parsed[1]["closes_at"]},
                    "wednesday": {"opens_at": opening_hours_parsed[2]["opens_at"], "closes_at": opening_hours_parsed[2]["closes_at"]},
                    "thursday": {"opens_at": opening_hours_parsed[3]["opens_at"], "closes_at": opening_hours_parsed[3]["closes_at"]},
                    "friday": {"opens_at": opening_hours_parsed[4]["opens_at"], "closes_at": opening_hours_parsed[4]["closes_at"]},
                    "saturday": {"opens_at": opening_hours_parsed[5]["opens_at"], "closes_at": opening_hours_parsed[5]["closes_at"]},
                    "sunday": {"opens_at": opening_hours_parsed[6]["opens_at"], "closes_at": opening_hours_parsed[6]["closes_at"]}
                },
                "rating": rating,
                "review_count": random.randint(5, 150),
                "price_level": budget_range,
                "image_url": img,
                "source_name": "OpenStreetMap",
                "source_url": f"https://www.openstreetmap.org/node/{osm_id}",
                "fetched_at": datetime.now().isoformat()
            })

            # Kiểm tra xem nhà hàng đã có trong DB chưa để chèn
            exists = db.scalar(select(RestaurantRow.id).where(RestaurantRow.id == rest_id).limit(1))
            if exists:
                skipped_count += 1
                continue

            # Tạo bản ghi nhà hàng
            rest_row = RestaurantRow(
                id=rest_id,
                name=name,
                location=address,
                cuisine_type=cuisine_type,
                budget_range=budget_range,
                rating=rating,
                timezone="Asia/Ho_Chi_Minh",
                active=True,
                description=desc,
                image_url=img
            )
            db.add(rest_row)
            db.flush()

            # Thêm giờ hoạt động vào DB
            for h in opening_hours_parsed:
                oh_row = OpeningHourRow(
                    restaurant_id=rest_id,
                    weekday=h["weekday"],
                    opens_at=h["opens_at"],
                    closes_at=h["closes_at"]
                )
                db.add(oh_row)

            # Giả lập 5 bàn ăn vào DB
            capacities = [2, 4, 4, 6, 8]
            for t_idx, cap in enumerate(capacities, 1):
                table_row = TableRow(
                    restaurant_id=rest_id,
                    table_code=f"T{t_idx:02d}",
                    capacity=cap,
                    seating_type="standard",
                    active=True
                )
                db.add(table_row)

            inserted_count += 1
            if idx % 100 == 0:
                db.flush()
                print(f"   Database: Đã chuẩn bị nạp {idx}/{total_count} nhà hàng...")

        db.commit()
        print(f"\nNạp thành công {inserted_count} nhà hàng mới vào database. Đã bỏ qua {skipped_count} nhà hàng đã tồn tại.")

    # 4. Xuất file
    write_files(crawled_list)

if __name__ == "__main__":
    main()
