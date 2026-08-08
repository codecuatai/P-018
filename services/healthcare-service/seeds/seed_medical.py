import os
import sys
from datetime import datetime, timedelta

# Add the project root to sys.path so we can import src
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.database import SessionLocal
from src.models.medical import (
    Appointment,
    AuditLog,
    Department,
    Doctor,
    IdempotencyRecord,
    Patient,
    SlotStatus,
    TimeSlot,
)


def seed_data():
    db = SessionLocal()

    print("Seeding Departments...")
    departments_data = [
        ("Khoa Nội Tim mạch", "Khám và điều trị bệnh về Tim, huyết áp, mạch máu"),
        ("Khoa Nội Thần kinh", "Khám não, tủy sống, dây thần kinh, đột quỵ"),
        ("Khoa Nội Cơ - Xương - Khớp", "Khám khớp, gân, thoái hóa, gout"),
        ("Khoa Nội Tiêu hóa - Gan mật", "Dạ dày, đại tràng, gan, mật"),
        ("Khoa Nội Hô hấp", "Phổi, phế quản, hen suyễn"),
        ("Khoa Nội Tiết", "Tiểu đường, tuyến giáp, rối loạn chuyển hóa"),
        ("Khoa Nội Thận - Tiết niệu & Lọc máu", "Khám thận, lọc máu"),
        ("Khoa Truyền nhiễm / Bệnh nhiệt đới", "Điều trị bệnh lây nhiễm"),
        ("Khoa Ngoại Tổng hợp", "Mổ tiêu hóa, gan mật, ruột thừa"),
        ("Khoa Ngoại Chấn thương Chỉnh hình", "Mổ gãy xương, đứt dây chằng, thay khớp"),
        ("Khoa Ngoại Thần kinh - Cột sống", "Mổ thoát vị đĩa đệm, chấn thương sọ não"),
        ("Khoa Ngoại Tiết niệu", "Sỏi thận, mổ tuyến tiền liệt"),
        ("Khoa Ngoại Lồng ngực - Tim mạch", "Phẫu thuật tim, lồng ngực"),
        ("Khoa Nhi", "Dành cho trẻ em"),
        ("Khoa Phụ sản", "Sản khoa và Phụ khoa"),
        ("Khoa Mắt", "Nhãn khoa"),
        ("Khoa Tai - Mũi - Họng", "Tai, Mũi, Họng"),
        ("Khoa Răng - Hàm - Mặt", "Khám răng miệng"),
        ("Khoa Da liễu", "Bệnh ngoài da"),
        ("Khoa Khám bệnh", "Tiếp nhận, phân loại và khám ban đầu")
    ]

    db.query(AuditLog).delete()
    db.query(Appointment).delete()
    db.query(IdempotencyRecord).delete()
    db.query(Patient).delete()
    db.query(TimeSlot).delete()
    db.query(Doctor).delete()
    db.query(Department).delete()
    db.commit()

    print("Seeding Patient...")
    # Keep the local demo identity stable so the Gateway adapter can use its
    # documented default without exposing an internal patient lookup to users.
    patient = Patient(id=1, name="Nguyễn Văn Bệnh Nhân", phone="0987654321", blood_type="O+", medical_history="Cao huyết áp")
    db.add(patient)
    db.commit()

    depts = []
    for name, desc in departments_data:
        d = Department(name=name, description=desc)
        depts.append(d)

    db.add_all(depts)
    db.commit()

    depts = db.query(Department).all()
    dept_map = {d.name: d for d in depts}

    print("Seeding Doctors...")
    docs = [
        Doctor(name="BS. Nguyễn Văn An", department_id=dept_map["Khoa Nội Thần kinh"].id, price=500000, description="Chuyên gia thần kinh"),
        Doctor(name="BS. Trần Thị Bình", department_id=dept_map["Khoa Nội Tim mạch"].id, price=550000, description="Kinh nghiệm 15 năm"),
        Doctor(name="BS. Lê Hoàng Cường", department_id=dept_map["Khoa Nội Tiêu hóa - Gan mật"].id, price=450000, description="Chuyên điều trị dạ dày"),
        Doctor(name="BS. Phạm Thị Dung", department_id=dept_map["Khoa Nội Thần kinh"].id, price=500000, description="Suy nhược thần kinh"),
        Doctor(name="BS. Đặng Văn Hùng", department_id=dept_map["Khoa Nội Cơ - Xương - Khớp"].id, price=400000, description="Chuyên chữa thoái hóa khớp"),
        Doctor(name="BS. Trịnh Quang Tuấn", department_id=dept_map["Khoa Ngoại Chấn thương Chỉnh hình"].id, price=600000, description="Phẫu thuật thay khớp, nối gân"),
        Doctor(name="BS. Lê Đình Nam", department_id=dept_map["Khoa Khám bệnh"].id, price=150000, description="Khám tổng quát, phân loại"),
        Doctor(name="BS. Bùi Thị Ngọc", department_id=dept_map["Khoa Mắt"].id, price=300000, description="Đo thị lực, cắt kính, mổ cận"),
        Doctor(name="BS. Hoàng Thanh Mai", department_id=dept_map["Khoa Da liễu"].id, price=250000, description="Trị mụn, laser da liễu"),
        Doctor(name="BS. Vũ Thị Phương", department_id=dept_map["Khoa Phụ sản"].id, price=350000, description="Khám thai, siêu âm thai"),
        Doctor(name="BS. Đỗ Trọng Tài", department_id=dept_map["Khoa Nhi"].id, price=200000, description="Khám nhi đồng"),
        Doctor(name="BS. Phạm Trung Kiên", department_id=dept_map["Khoa Nội Hô hấp"].id, price=300000, description="Hen suyễn, viêm phế quản"),
        Doctor(name="BS. Lê Thu Trà", department_id=dept_map["Khoa Nội Tiết"].id, price=350000, description="Tiểu đường, tuyến giáp"),
        Doctor(name="BS. Phan Văn Đạt", department_id=dept_map["Khoa Nội Thận - Tiết niệu & Lọc máu"].id, price=400000, description="Khám thận, chạy thận"),
        Doctor(name="BS. Ngô Tuấn Hải", department_id=dept_map["Khoa Truyền nhiễm / Bệnh nhiệt đới"].id, price=250000, description="Sốt xuất huyết, viêm gan"),
        Doctor(name="BS. Trần Đình Tùng", department_id=dept_map["Khoa Ngoại Tổng hợp"].id, price=500000, description="Mổ ruột thừa, sỏi mật"),
        Doctor(name="BS. Nguyễn Quốc Bảo", department_id=dept_map["Khoa Ngoại Thần kinh - Cột sống"].id, price=700000, description="Mổ thoát vị đĩa đệm"),
        Doctor(name="BS. Trương Viết Phúc", department_id=dept_map["Khoa Ngoại Tiết niệu"].id, price=450000, description="Mổ sỏi thận"),
        Doctor(name="BS. Lý Quang Huy", department_id=dept_map["Khoa Ngoại Lồng ngực - Tim mạch"].id, price=800000, description="Phẫu thuật tim, van tim"),
        Doctor(name="BS. Cao Thị Thu", department_id=dept_map["Khoa Tai - Mũi - Họng"].id, price=250000, description="Khám viêm xoang, amidan"),
        Doctor(name="BS. Đinh Công Trí", department_id=dept_map["Khoa Răng - Hàm - Mặt"].id, price=200000, description="Nhổ răng khôn, niềng răng")
    ]

    db.add_all(docs)
    db.commit()

    print("Seeding TimeSlots...")
    tomorrow = datetime.now() + timedelta(days=1)
    base_time = tomorrow.replace(hour=8, minute=0, second=0, microsecond=0)

    slots = []
    for doc in docs:
        for i in range(4): # 4 slots per doctor
            start = base_time + timedelta(hours=i)
            end = start + timedelta(minutes=30)
            slots.append(TimeSlot(
                doctor_id=doc.id,
                start_time=start,
                end_time=end,
                status=SlotStatus.AVAILABLE
            ))

    db.add_all(slots)
    db.commit()

    print("Seed complete!")
    db.close()

if __name__ == "__main__":
    seed_data()
