import uvicorn

if __name__ == "__main__":
    uvicorn.run("payment_service.main:app", host="127.0.0.1", port=8001, reload=True)
