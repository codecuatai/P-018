# Vận Hành Dữ Liệu Danh Mục (Catalog DataOps)

Ba script wrapper do từng domain sở hữu chịu trách nhiệm thẩm định các tệp dữ liệu nguồn Hà Nội và tạo kế hoạch import có phiên bản mà không can thiệp vào các tệp CSV gốc:

```powershell
python scripts/data/import_food_dataset.py --dataset-version hanoi_food_2026_08_v1
python scripts/data/import_restaurant_dataset.py --dataset-version hanoi_restaurant_2026_08_v1
python scripts/data/import_healthcare_dataset.py --dataset-version hanoi_healthcare_2026_08_v1
```

Mỗi kế hoạch bao gồm `manifest.json`, `normalized.jsonl`, và `rejected.jsonl` được lưu trữ dưới thư mục `artifacts/dataops/`. Việc áp dụng (apply) là một thao tác vận hành chủ động sau khi các migration tương ứng đã hoàn tất:

```powershell
python scripts/data/import_food_dataset.py --dataset-version hanoi_food_2026_08_v1 --apply
```

Lệnh chỉ sử dụng biến môi trường `*_DATABASE_URL` của domain tương ứng khi cờ `--apply` được cung cấp. Chạy lại cùng một phiên bản sẽ thực hiện thao tác upsert dựa trên ID bản ghi nguồn / mã băm nội dung ổn định. Việc kích hoạt một phiên bản mới sẽ đánh dấu các bản ghi danh mục cũ là không hoạt động (inactive); cờ `--deactivate-version` cho phép vô hiệu hóa một phiên bản phát hành bị lỗi.

Tệp CSV chuyên khoa y tế được sửa lỗi chỉ trong bản chiếu staging: tệp thô gốc được giữ nguyên vẹn và các dòng thiếu URL nguồn vẫn được import kèm cờ cảnh báo chất lượng rõ ràng.
