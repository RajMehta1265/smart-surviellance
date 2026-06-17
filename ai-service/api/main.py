from fastapi import FastAPI, WebSocket, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import cv2
import os
import asyncio
import time
import threading
import requests

from datetime import datetime
from ultralytics import YOLO

try:
    from api.websocket_manager import manager
except ModuleNotFoundError:
    from websocket_manager import manager

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
# CAMERA – open once, shared across threads
# Set small buffer size so we always read the latest frame
# =========================================================
camera = cv2.VideoCapture(0)
camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

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
alerted_ids: set = set()

# =========================================================
# LOG FILE
# =========================================================
log_file = "logs/events.txt"

# =========================================================
# SHARED FRAME STATE
# Inference thread writes here; stream reads from here.
# This decouples YOLO speed from streaming FPS.
# =========================================================
_frame_lock = threading.Lock()
_latest_annotated_frame: bytes | None = None   # JPEG bytes

_raw_lock = threading.Lock()
_latest_raw_frame = None                        # numpy array
_raw_frame_available = threading.Event()

# =========================================================
# CAMERA READER THREAD
# Reads from the webcam as fast as possible, stores the
# most recent frame so the inference thread never blocks.
# =========================================================
def _camera_reader():
    global _latest_raw_frame
    while True:
        success, frame = camera.read()
        if not success:
            time.sleep(0.05)
            continue
        with _raw_lock:
            _latest_raw_frame = frame
        _raw_frame_available.set()

# =========================================================
# YOLO INFERENCE THREAD
# Pulls the latest raw frame, runs YOLO, annotates it, and
# saves the JPEG bytes to _latest_annotated_frame.
# Alert / event logic lives here (not in the stream path).
# =========================================================
def _inference_worker():
    global _latest_annotated_frame

    while True:
        _raw_frame_available.wait()
        _raw_frame_available.clear()

        with _raw_lock:
            frame = _latest_raw_frame
        if frame is None:
            continue

        # ── YOLO tracking ──────────────────────────────────────
        results = model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],
            conf=0.5,
            verbose=False,
        )
        annotated_frame = results[0].plot()

        # ── Draw restricted zone ───────────────────────────────
        cv2.rectangle(
            annotated_frame,
            (ZONE_X1, ZONE_Y1),
            (ZONE_X2, ZONE_Y2),
            (0, 0, 255),
            3,
        )

        # ── Per-track alert logic ──────────────────────────────
        boxes = results[0].boxes
        if boxes.id is not None:
            ids  = boxes.id.cpu().numpy().astype(int)
            xyxy = boxes.xyxy.cpu().numpy()

            for i, (box, track_id) in enumerate(zip(xyxy, ids)):
                x1, y1, x2, y2 = map(int, box)
                cls_id     = int(boxes.cls[i].item())
                confidence = float(boxes.conf[i].item())
                label      = model.names[cls_id]
                center_x   = int((x1 + x2) / 2)
                center_y   = int((y1 + y2) / 2)

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
                        2,
                    )

                    if track_id not in alerted_ids:
                        alerted_ids.add(track_id)
                        timestamp  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        image_name = f"intrusion_{track_id}_{int(time.time())}.jpg"
                        image_path = os.path.join("snapshots", image_name)
                        cv2.imwrite(image_path, annotated_frame)

                        # Write event log
                        try:
                            with open(log_file, "a") as f:
                                f.write(
                                    f"[{timestamp}] ALERT: Person ID {track_id} "
                                    "entered restricted zone\n"
                                )
                        except Exception as log_err:
                            print("Failed to write event log:", log_err)

                        # Fire-and-forget HTTP alert to Node backend
                        def _send_alert(ts, lbl, conf, tid, img):
                            try:
                                requests.post(
                                    "http://localhost:5001/api/alerts",
                                    json={
                                        "label": lbl,
                                        "confidence": round(conf, 2),
                                        "person_id": int(tid),
                                        "timestamp": ts,
                                        "snapshot": img,
                                    },
                                    timeout=3,
                                )
                            except Exception as e:
                                print("Backend Error:", e)

                        threading.Thread(
                            target=_send_alert,
                            args=(timestamp, label, confidence, track_id, image_name),
                            daemon=True,
                        ).start()

                        # WebSocket broadcast (best-effort)
                        alert_data = {
                            "event":      "intrusion",
                            "label":      label,
                            "confidence": round(confidence, 2),
                            "person_id":  int(track_id),
                            "timestamp":  timestamp,
                            "snapshot":   image_name,
                        }
                        try:
                            loop = asyncio.get_event_loop()
                            if loop.is_running():
                                asyncio.run_coroutine_threadsafe(
                                    manager.broadcast(alert_data), loop
                                )
                        except Exception:
                            pass

        # ── Encode annotated frame to JPEG ─────────────────────
        ret, buffer = cv2.imencode(
            ".jpg",
            annotated_frame,
            [cv2.IMWRITE_JPEG_QUALITY, 80],
        )
        if ret:
            with _frame_lock:
                _latest_annotated_frame = buffer.tobytes()


# ── Start background threads ───────────────────────────────
_camera_thread    = threading.Thread(target=_camera_reader,   daemon=True)
_inference_thread = threading.Thread(target=_inference_worker, daemon=True)
_camera_thread.start()
_inference_thread.start()


# =========================================================
# ROUTES
# =========================================================

@app.get("/")
def home():
    return {"message": "AI Surveillance Running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/snapshot/{filename}")
def get_snapshot(filename: str):
    file_path = os.path.join("snapshots", filename)
    if os.path.exists(file_path):
        with open(file_path, "rb") as f:
            return Response(content=f.read(), media_type="image/jpeg")
    return {"error": f"File {filename} not found"}


@app.get("/events")
def get_events():
    if not os.path.exists(log_file):
        return {"events": []}
    try:
        with open(log_file, "r") as f:
            events = [line.strip() for line in f.readlines() if line.strip()]
        return {"events": events}
    except Exception as e:
        return {"events": [], "error": str(e)}


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
# VIDEO FEED
# Reads pre-encoded frames from shared buffer – no YOLO here.
# Delivers up to 30 fps regardless of inference speed.
# =========================================================
def _stream_frames():
    while True:
        with _frame_lock:
            frame_bytes = _latest_annotated_frame

        if frame_bytes is None:
            time.sleep(0.001)
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" +
            frame_bytes +
            b"\r\n"
        )

        # Cap at ~30 fps to avoid saturating the connection
        time.sleep(1 / 30)


@app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        _stream_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# =========================================================
# CLEANUP
# =========================================================
@app.on_event("shutdown")
def shutdown_event():
    camera.release()