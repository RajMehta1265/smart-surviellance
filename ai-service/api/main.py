from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

import cv2
import os
import asyncio
import time
import requests

from datetime import datetime
from ultralytics import YOLO

from api.websocket_manager import manager

# =========================================================
# FASTAPI APP
# =========================================================
app = FastAPI()

# =========================================================
# CORS
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# YOLO MODEL
# =========================================================
model = YOLO("yolov8n.pt")

# =========================================================
# CAMERA
# =========================================================
camera = cv2.VideoCapture(0)

# =========================================================
# FOLDERS
# =========================================================
os.makedirs("snapshots", exist_ok=True)
os.makedirs("logs", exist_ok=True)

# =========================================================
# RESTRICTED ZONE
# =========================================================
ZONE_X1 = 200
ZONE_Y1 = 100
ZONE_X2 = 500
ZONE_Y2 = 400

# =========================================================
# ALERT TRACKER
# =========================================================
alerted_ids = set()

# =========================================================
# LOG FILE
# =========================================================
log_file = "logs/events.txt"

# =========================================================
# HOME
# =========================================================
@app.get("/")
def home():

    return {
        "message": "AI Surveillance Running"
    }

# =========================================================
# HEALTH
# =========================================================
@app.get("/health")
def health():

    return {
        "status": "healthy"
    }

# =========================================================
# WEBSOCKET
# =========================================================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    await manager.connect(websocket)

    try:

        while True:
            await asyncio.sleep(1)

    except Exception:

        manager.disconnect(websocket)

# =========================================================
# VIDEO PIPELINE
# =========================================================
def generate_frames():

    while True:

        success, frame = camera.read()

        if not success:
            break

        results = model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],
            conf=0.5
        )

        annotated_frame = results[0].plot()

        # =========================================================
        # RESTRICTED ZONE
        # =========================================================
        cv2.rectangle(
            annotated_frame,
            (ZONE_X1, ZONE_Y1),
            (ZONE_X2, ZONE_Y2),
            (0, 0, 255),
            3
        )

        boxes = results[0].boxes

        if boxes.id is not None:

            ids = boxes.id.cpu().numpy().astype(int)
            xyxy = boxes.xyxy.cpu().numpy()

            for i, (box, track_id) in enumerate(zip(xyxy, ids)):

                x1, y1, x2, y2 = map(int, box)

                cls_id = int(boxes.cls[i].item())
                confidence = float(boxes.conf[i].item())

                label = model.names[cls_id]

                center_x = int((x1 + x2) / 2)
                center_y = int((y1 + y2) / 2)

                inside_zone = (
                    ZONE_X1 < center_x < ZONE_X2 and
                    ZONE_Y1 < center_y < ZONE_Y2
                )

                if inside_zone:

                    cv2.putText(
                        annotated_frame,
                        f"{label} {confidence:.2f}",
                        (x1, y1 - 20),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 255, 255),
                        2
                    )

                    if track_id not in alerted_ids:

                        alerted_ids.add(track_id)

                        timestamp = datetime.now().strftime(
                            "%Y-%m-%d %H:%M:%S"
                        )

                        image_name = (
                            f"intrusion_{track_id}_{int(time.time())}.jpg"
                        )

                        image_path = os.path.join(
                            "snapshots",
                            image_name
                        )

                        cv2.imwrite(
                            image_path,
                            annotated_frame
                        )

                        # =========================================================
                        # SEND TO NODE BACKEND
                        # =========================================================
                        try:

                            response = requests.post(
                                "http://localhost:5001/api/alerts",
                                json={
                                    "label": label,
                                    "confidence": round(confidence, 2),
                                    "person_id": int(track_id),
                                    "timestamp": timestamp,
                                    "snapshot": image_name
                                }
                            )

                            print(
                                "Alert Sent:",
                                response.status_code
                            )

                        except Exception as e:

                            print("Backend Error:", e)

                        # =========================================================
                        # WEBSOCKET
                        # =========================================================
                        alert_data = {
                            "event": "intrusion",
                            "label": label,
                            "confidence": round(confidence, 2),
                            "person_id": int(track_id),
                            "timestamp": timestamp,
                            "snapshot": image_name
                        }

                        asyncio.create_task(
                            manager.broadcast(alert_data)
                        )

        ret, buffer = cv2.imencode(
            ".jpg",
            annotated_frame
        )

        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' +
            frame_bytes +
            b'\r\n'
        )

# =========================================================
# VIDEO FEED
# =========================================================
@app.get("/video_feed")
def video_feed():

    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# =========================================================
# CLEANUP
# =========================================================
@app.on_event("shutdown")
def shutdown_event():

    camera.release()