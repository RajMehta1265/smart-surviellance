import cv2
import time
from ultralytics import YOLO

# Load YOLO model
model = YOLO("yolov8n.pt")

# Open webcam
cap = cv2.VideoCapture(0)

# Check webcam
if not cap.isOpened():
    print("Error: Could not open webcam.")
    exit()

# Store unique tracked IDs
unique_ids = set()

# FPS calculation
prev_time = time.time()

while True:
    # Read frame
    ret, frame = cap.read()

    if not ret:
        print("Failed to read frame.")
        break

    # Run tracking
    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=[0],       # Detect only persons
        conf=0.5
    )

    # Annotated frame
    annotated_frame = results[0].plot()

    # Extract boxes
    boxes = results[0].boxes

    current_ids = []

    # If tracking IDs exist
    if boxes.id is not None:
        ids = boxes.id.cpu().numpy().astype(int)

        for track_id in ids:
            unique_ids.add(track_id)
            current_ids.append(track_id)

        # Print tracked IDs
        print(f"Current IDs: {current_ids}")

    # FPS calculation
    current_time = time.time()
    fps = 1 / (current_time - prev_time)
    prev_time = current_time

    # Display analytics on frame
    cv2.putText(
        annotated_frame,
        f"FPS: {int(fps)}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2
    )

    cv2.putText(
        annotated_frame,
        f"Current People: {len(current_ids)}",
        (20, 80),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (255, 0, 0),
        2
    )

    cv2.putText(
        annotated_frame,
        f"Unique People Seen: {len(unique_ids)}",
        (20, 120),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 0, 255),
        2
    )

    # Show frame
    cv2.imshow("AI Smart Surveillance Tracking", annotated_frame)

    # Quit on 'q'
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

# Cleanup
cap.release()
cv2.destroyAllWindows()