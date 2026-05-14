import cv2
import time
from ultralytics import YOLO

# Load YOLO model
model = YOLO("yolov8n.pt")

# Open webcam
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Error opening webcam")
    exit()

# Restricted zone coordinates
ZONE_X1 = 200
ZONE_Y1 = 100
ZONE_X2 = 500
ZONE_Y2 = 400

# Track IDs already alerted
alerted_ids = set()

# FPS
prev_time = time.time()

while True:
    ret, frame = cap.read()

    if not ret:
        break

    # Run tracking
    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=[0],
        conf=0.5
    )

    annotated_frame = results[0].plot()

    # Draw restricted zone
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

    boxes = results[0].boxes

    if boxes.id is not None:

        ids = boxes.id.cpu().numpy().astype(int)
        xyxy = boxes.xyxy.cpu().numpy()

        for box, track_id in zip(xyxy, ids):

            x1, y1, x2, y2 = map(int, box)

            # Calculate center point
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

            # Check intrusion
            inside_zone = (
                ZONE_X1 < center_x < ZONE_X2 and
                ZONE_Y1 < center_y < ZONE_Y2
            )

            if inside_zone:

                # Draw alert text
                cv2.putText(
                    annotated_frame,
                    f"INTRUSION: ID {track_id}",
                    (x1, y1 - 20),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 0, 255),
                    2
                )

                # Trigger alert only once per ID
                if track_id not in alerted_ids:
                    print(f"ALERT: Person {track_id} entered restricted zone")

                    alerted_ids.add(track_id)

    # FPS
    current_time = time.time()

    fps = 1 / (current_time - prev_time)

    prev_time = current_time

    cv2.putText(
        annotated_frame,
        f"FPS: {int(fps)}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2
    )

    # Show frame
    cv2.imshow("Intrusion Detection", annotated_frame)

    # Quit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()