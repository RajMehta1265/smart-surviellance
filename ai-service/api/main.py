from fastapi import FastAPI, WebSocket, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os

from api.websocket_manager import manager

app = FastAPI()

# Home
@app.get("/")
def home():
    return {
        "message": "AI Smart Surveillance Backend Running"
    }

# Health
@app.get("/health")
def health():
    return {
        "status": "healthy"
    }

# Events
@app.get("/events")
def get_events():

    log_file = "logs/events.txt"

    if not os.path.exists(log_file):
        return {
            "events": []
        }

    with open(log_file, "r") as f:
        events = f.readlines()

    return {
        "events": events
    }

# Snapshots
@app.get("/snapshots")
def get_snapshots():

    folder = "snapshots"

    if not os.path.exists(folder):
        return {
            "snapshots": []
        }

    files = os.listdir(folder)

    return {
        "snapshots": files
    }

# Get image
@app.get("/snapshot/{image_name}")
def get_snapshot(image_name: str):

    image_path = os.path.join(
        "snapshots",
        image_name
    )

    if os.path.exists(image_path):
        return FileResponse(image_path)

    return {
        "error": "Image not found"
    }

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    await manager.connect(websocket)

    try:
        while True:
            await websocket.receive_text()

    except:
        manager.disconnect(websocket)

        
@app.post("/broadcast")
async def broadcast_alert(data: dict = Body(...)):

    await manager.broadcast(data)

    return {
        "status": "sent"
    }        


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)