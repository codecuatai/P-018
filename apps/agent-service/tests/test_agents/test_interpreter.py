from src.agents.assistant.contracts import Operation
from src.agents.assistant.understanding.interpreter import _operation


def test_operation_cancel():
    assert _operation("hủy chuyến đi") == Operation.CANCEL
    assert _operation("huỷ đơn hàng") == Operation.CANCEL


def test_operation_does_not_cancel_on_thuy_loi():
    assert _operation("đặt xe về đại học thủy lợi từ đại học Vinuni") == Operation.CREATE
    assert _operation("đi chơi thủy cung") == Operation.DISCOVER
