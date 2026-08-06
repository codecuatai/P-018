from src.application.domains.contracts import Domain
from src.application.domains.unavailable import UnavailableDomainWorkflow


class FoodWorkflow(UnavailableDomainWorkflow):
    def __init__(self):
        super().__init__(
            Domain.FOOD,
            ("đồ ăn", "đặt món", "nhà hàng", "quán ăn", "thực đơn", "food", "giao đồ ăn"),
            "Mình có thể giúp bạn làm rõ nhu cầu đồ ăn, nhưng Food Service chưa được kết nối nên chưa thể tra quán, thực đơn hoặc tạo đơn thật.",
        )


food_workflow = FoodWorkflow()
