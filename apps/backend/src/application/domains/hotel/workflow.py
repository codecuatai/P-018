from src.application.domains.contracts import Domain
from src.application.domains.unavailable import UnavailableDomainWorkflow


class HotelWorkflow(UnavailableDomainWorkflow):
    def __init__(self):
        super().__init__(
            Domain.HOTEL,
            ("khách sạn", "hotel", "lưu trú", "đặt phòng", "phòng nghỉ", "check-in"),
            "Mình có thể hỗ trợ bạn xác định nhu cầu lưu trú, nhưng Hotel Service chưa được kết nối nên chưa thể kiểm tra phòng trống, giá hoặc giữ phòng.",
        )


hotel_workflow = HotelWorkflow()
