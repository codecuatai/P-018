import requests

try:
    res = requests.post("http://127.0.0.1:8001/api/v1/chat", json={
        "message": "Tôi muốn khám mắt",
        "user_id": "test_user_123"
    })
    print("STATUS:", res.status_code)
    print("RESPONSE:", res.text)
except Exception as e:
    print("ERROR:", e)
