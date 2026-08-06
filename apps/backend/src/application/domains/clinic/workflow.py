from src.application.domains.contracts import Domain
from src.application.domains.unavailable import UnavailableDomainWorkflow


class ClinicWorkflow(UnavailableDomainWorkflow):
    def __init__(self):
        super().__init__(
            Domain.CLINIC,
            ("đặt lịch khám", "bác sĩ", "bệnh viện", "phòng khám", "khám bệnh", "lịch khám"),
            "Mình có thể hỗ trợ bạn chuẩn bị nhu cầu đặt lịch khám, nhưng Clinic Service chưa được kết nối nên chưa thể xem lịch bác sĩ hoặc tạo lịch hẹn thật.",
        )


clinic_workflow = ClinicWorkflow()
