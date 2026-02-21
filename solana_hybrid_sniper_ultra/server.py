from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/signals")
def get_signals():
    return {"mode": "SNIPER", "pump_probability": 0.85, "open_positions": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
