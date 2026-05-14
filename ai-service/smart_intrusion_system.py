import cv2
import time
import os
from datetime import datetime
from ultralytics import YOLO
import requests

# =========================
# LOAD YOLO MODEL
# =========================
model = YOLO("yolov8n.pt")

# =========================
# OPEN WEBCAM
# =========================
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Error opening webcam")
    exit()

# =========================
# CREATE REQUIRED FOLDERS
# =========================
os.makedirs("snapshots", exist_ok=True)
os.makedirs("logs", exist_ok=True)

# =========================
# RESTRICTED ZONE
# =========================
ZONE_X1 = 200
ZONE_Y1 = 100
ZONE_X2 = 500
ZONE_Y2 = 400

# =========================
# ALERT TRACKING
# =========================
alerted_ids = set()

# =========================
# LOG FILE
# =========================
log_file = "logs/events.txt"

# =========================
# FPS TRACKING
# =========================
prev_time = time.time()

# =========================
# MAIN LOOP
# =========================
while True:

    # Read frame
    ret, frame = cap.read()

    if not ret:
        break

    # =========================
    # RUN YOLO TRACKING
    # =========================
    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=[0],   # Person class only
        conf=0.5
    )

    # Draw YOLO annotations
    annotated_frame = results[0].plot()

    # =========================
    # DRAW RESTRICTED ZONE
    # =========================
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

    # =========================
    # GET DETECTIONS
    # =========================
    boxes = results[0].boxes

    if boxes.id is not None:

        ids = boxes.id.cpu().numpy().astype(int)
        xyxy = boxes.xyxy.cpu().numpy()

        for box, track_id in zip(xyxy, ids):

            x1, y1, x2, y2 = map(int, box)

            # =========================
            # CENTER POINT
            # =========================
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

            # =========================
            # CHECK INTRUSION
            # =========================
            inside_zone = (
                ZONE_X1 < center_x < ZONE_X2 and
                ZONE_Y1 < center_y < ZONE_Y2
            )

            if inside_zone:

                # Draw intrusion alert on frame
                cv2.putText(
                    annotated_frame,
                    f"INTRUSION: ID {track_id}",
                    (x1, y1 - 20),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 0, 255),
                    2
                )

                # =========================
                # PREVENT REPEATED ALERTS
                # =========================
                if track_id not in alerted_ids:

                    alerted_ids.add(track_id)

                    # =========================
                    # TIMESTAMP
                    # =========================
                    timestamp = datetime.now().strftime(
                        "%Y-%m-%d %H:%M:%S"
                    )

                    # =========================
                    # SAVE SNAPSHOT
                    # =========================
                    image_name = (
                        f"intrusion_{track_id}_{int(time.time())}.jpg"
                    )

                    image_path = os.path.join(
                        "snapshots",
                        image_name
                    )

                    cv2.imwrite(image_path, annotated_frame)

                    # =========================
                    # EVENT MESSAGE
                    # =========================
                    event_message = (
                        f"[{timestamp}] "
                        f"INTRUSION DETECTED | "
                        f"Person ID: {track_id} | "
                        f"Snapshot: {image_name}"
                    )

                    # =========================
                    # TERMINAL ALERT
                    # =========================
                    print(event_message)

                    # =========================
                    # WEBSOCKET ALERT DATA
                    # =========================
                    alert_data = {
                        "event": "intrusion",
                        "person_id": int(track_id),
                        "timestamp": timestamp,
                        "snapshot": image_name
                    }

                    # =========================
                    # SEND ALERT TO FASTAPI
                    # =========================
                    try:
                        requests.post(
                            "http://127.0.0.1:8000/broadcast",
                            json=alert_data
                        )

                    except Exception as e:
                        print("WebSocket broadcast failed:", e)

                    # =========================
                    # WRITE LOG
                    # =========================
                    with open(log_file, "a") as f:
                        f.write(event_message + "\n")

    # =========================
    # FPS CALCULATION
    # =========================
    current_time = time.time()

    fps = 1 / (current_time - prev_time)

    prev_time = current_time

    # Display FPS
    cv2.putText(
        annotated_frame,
        f"FPS: {int(fps)}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2
    )

    # =========================
    # SHOW FRAME
    # =========================
    cv2.imshow(
        "AI Smart Surveillance System",
        annotated_frame
    )

    # =========================
    # EXIT
    # =========================
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

# =========================
# CLEANUP
# =========================
cap.release()
cv2.destroyAllWindows()