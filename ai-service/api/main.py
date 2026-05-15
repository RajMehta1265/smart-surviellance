from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse,
    StreamingResponse
)

import cv2
import os
import asyncio
import time

from datetime import datetime

from ultralytics import YOLO

from api.websocket_manager import manager

# ==========================================
# CREATE FASTAPI APP
# ==========================================
app = FastAPI()

# ==========================================
# ENABLE CORS
# Allows frontend to access backend APIs
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# LOAD YOLO MODEL
# ==========================================
model = YOLO("yolov8n.pt")

# ==========================================
# OPEN CAMERA
# ==========================================
camera = cv2.VideoCapture(0)

# ==========================================
# CREATE REQUIRED FOLDERS
# ==========================================
os.makedirs("snapshots", exist_ok=True)
os.makedirs("logs", exist_ok=True)

# ==========================================
# RESTRICTED ZONE
# ==========================================
ZONE_X1 = 200
ZONE_Y1 = 100
ZONE_X2 = 500
ZONE_Y2 = 400

# ==========================================
# ALERT TRACKING
# Prevent repeated alerts
# ==========================================
alerted_ids = set()

# ==========================================
# EVENT LOG FILE
# ==========================================
log_file = "logs/events.txt"

# ==========================================
# HOME ROUTE
# ==========================================
@app.get("/")
def home():

    return {
        "message": "AI Smart Surveillance Backend Running"
    }

# ==========================================
# HEALTH CHECK
# ==========================================
@app.get("/health")
def health():

    return {
        "status": "healthy"
    }

# ==========================================
# GET EVENT LOGS
# ==========================================
@app.get("/events")
def get_events():

    if not os.path.exists(log_file):

        return {
            "events": []
        }

    with open(log_file, "r") as f:
        events = f.readlines()

    return {
        "events": events
    }

# ==========================================
# GET SNAPSHOT FILES
# ==========================================
@app.get("/snapshots")
def get_snapshots():

    files = os.listdir("snapshots")

    return {
        "snapshots": files
    }

# ==========================================
# GET SINGLE SNAPSHOT
# ==========================================
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

# ==========================================
# WEBSOCKET ENDPOINT
# ==========================================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    await manager.connect(websocket)

    print("WebSocket client connected")

    try:

        while True:
            await asyncio.sleep(1)

    except Exception as e:

        print("WebSocket disconnected:", e)

        manager.disconnect(websocket)

# ==========================================
# VIDEO + AI PIPELINE
# ==========================================
def generate_frames():

    while True:

        # ==========================================
        # READ CAMERA FRAME
        # ==========================================
        success, frame = camera.read()

        if not success:
            break

        # ==========================================
        # RUN YOLO TRACKING
        # ==========================================
        results = model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],
            conf=0.5
        )

        # ==========================================
        # DRAW DETECTIONS
        # ==========================================
        annotated_frame = results[0].plot()

        # ==========================================
        # DRAW RESTRICTED ZONE
        # ==========================================
        cv2.rectangle(
            annotated_frame,
            (ZONE_X1, ZONE_Y1),
            (ZONE_X2, ZONE_Y2),
            (0, 0, 255),
            3
        )

        cv2.putText(
            annotated_frame,
            "RESTRICTED ZONE",
            (ZONE_X1, ZONE_Y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 0, 255),
            2
        )

        # ==========================================
        # GET DETECTION BOXES
        # ==========================================
        boxes = results[0].boxes

        if boxes.id is not None:

            ids = boxes.id.cpu().numpy().astype(int)

            xyxy = boxes.xyxy.cpu().numpy()

            for box, track_id in zip(xyxy, ids):

                x1, y1, x2, y2 = map(int, box)

                # ==========================================
                # CENTER POINT
                # ==========================================
                center_x = int((x1 + x2) / 2)

                center_y = int((y1 + y2) / 2)

                # Draw center point
                cv2.circle(
                    annotated_frame,
                    (center_x, center_y),
                    5,
                    (255, 0, 0),
                    -1
                )

                # ==========================================
                # CHECK INTRUSION
                # ==========================================
                inside_zone = (
                    ZONE_X1 < center_x < ZONE_X2 and
                    ZONE_Y1 < center_y < ZONE_Y2
                )

                if inside_zone:

                    # Draw intrusion alert
                    cv2.putText(
                        annotated_frame,
                        f"INTRUSION: ID {track_id}",
                        (x1, y1 - 20),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.8,
                        (0, 0, 255),
                        2
                    )

                    # ==========================================
                    # PREVENT DUPLICATE ALERTS
                    # ==========================================
                    if track_id not in alerted_ids:

                        alerted_ids.add(track_id)

                        # ==========================================
                        # TIMESTAMP
                        # ==========================================
                        timestamp = datetime.now().strftime(
                            "%Y-%m-%d %H:%M:%S"
                        )

                        # ==========================================
                        # SNAPSHOT FILE
                        # ==========================================
                        image_name = (
                            f"intrusion_{track_id}_{int(time.time())}.jpg"
                        )

                        image_path = os.path.join(
                            "snapshots",
                            image_name
                        )

                        # Save snapshot
                        cv2.imwrite(
                            image_path,
                            annotated_frame
                        )

                        # ==========================================
                        # EVENT MESSAGE
                        # ==========================================
                        event_message = (
                            f"[{timestamp}] "
                            f"INTRUSION DETECTED | "
                            f"Person ID: {track_id} | "
                            f"Snapshot: {image_name}"
                        )

                        print(event_message)

                        # ==========================================
                        # SAVE LOG
                        # ==========================================
                        with open(log_file, "a") as f:
                            f.write(event_message + "\n")

                        # ==========================================
                        # WEBSOCKET ALERT DATA
                        # ==========================================
                        alert_data = {
                            "event": "intrusion",
                            "person_id": int(track_id),
                            "timestamp": timestamp,
                            "snapshot": image_name
                        }

                        # ==========================================
                        # BROADCAST LIVE ALERT
                        # ==========================================
                        try:

                            asyncio.create_task(
                                manager.broadcast(alert_data)
                            )

                        except Exception as e:

                            print("Broadcast failed:", e)

        # ==========================================
        # CONVERT FRAME TO JPEG
        # ==========================================
        ret, buffer = cv2.imencode(
            ".jpg",
            annotated_frame
        )

        frame_bytes = buffer.tobytes()

        # ==========================================
        # MJPEG STREAM
        # ==========================================
        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' +
            frame_bytes +
            b'\r\n'
        )

# ==========================================
# LIVE VIDEO STREAM API
# ==========================================
@app.get("/video_feed")
def video_feed():

    return StreamingResponse(
        generate_frames(),
        media_type=(
            "multipart/x-mixed-replace; boundary=frame"
        )
    )

# ==========================================
# CLEANUP CAMERA
# ==========================================
@app.on_event("shutdown")
def shutdown_event():

    camera.release()