import cv2
import numpy as np
import base64
import os
import time
import tensorflow as tf
from typing import Optional, Tuple, List
from models import Detection

# Paths relative to the backend/ directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACE_PROTO = os.path.join(BASE_DIR, "face_detector", "deploy.prototxt")
FACE_WEIGHTS = os.path.join(BASE_DIR, "face_detector", "res10_300x300_ssd_iter_140000.caffemodel")
MASK_MODEL_PATH = os.path.join(BASE_DIR, "mask_detector.model")
VIOLATIONS_DIR = os.path.join(BASE_DIR, "violations")

preprocess_input = tf.keras.applications.mobilenet_v2.preprocess_input
img_to_array = tf.keras.preprocessing.image.img_to_array

# Global model references (populated at startup)
face_net = None
mask_net = None

# ── Confidence thresholds ──────────────────────────────────────────────────
# Both classes must exceed this threshold for a confident label.
# Predictions below this on the winning class → "Uncertain / Improper Mask".
# This reduces false positives from hands, scarves, or partial occlusions
# without modifying model weights or retraining.
MASK_CONFIDENCE_THRESHOLD: float = 0.95

# Cooldown state: minimum 3 seconds between consecutive violation saves
_COOLDOWN_SECONDS = 3.0
_last_violation_time: float = 0.0


def _save_violation(frame: np.ndarray) -> Optional[str]:
    """Save an annotated frame to the violations/ folder if cooldown has elapsed.
    Returns the saved filename (basename only), or None if still in cooldown.
    """
    global _last_violation_time
    now = time.time()
    if now - _last_violation_time < _COOLDOWN_SECONDS:
        return None

    os.makedirs(VIOLATIONS_DIR, exist_ok=True)
    filename = f"{int(now)}.jpg"
    filepath = os.path.join(VIOLATIONS_DIR, filename)
    cv2.imwrite(filepath, frame)
    _last_violation_time = now
    print(f"[VIOLATION] Saved → {filepath}")
    return filename


def load_models():
    """Load Caffe face detector and Keras mask classifier into globals."""
    global face_net, mask_net
    face_net = cv2.dnn.readNet(FACE_PROTO, FACE_WEIGHTS)
    mask_net = tf.keras.models.load_model(MASK_MODEL_PATH)
    print("[INFO] Models loaded successfully.")


def _detect_faces(frame: np.ndarray) -> list:
    """Run Caffe SSD face detector; return list of (startX,startY,endX,endY)."""
    (h, w) = frame.shape[:2]
    blob = cv2.dnn.blobFromImage(frame, 1.0, (224, 224), (104.0, 177.0, 123.0))
    face_net.setInput(blob)
    detections = face_net.forward()

    boxes = []
    for i in range(detections.shape[2]):
        confidence = float(detections[0, 0, i, 2])
        if confidence > 0.5:
            box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            (sX, sY, eX, eY) = box.astype("int")
            sX, sY = max(0, sX), max(0, sY)
            eX, eY = min(w - 1, eX), min(h - 1, eY)
            boxes.append((sX, sY, eX, eY))
    return boxes


def run_inference(image_bytes: bytes) -> Tuple[List[Detection], str, Optional[str]]:
    """
    Full inference pipeline:
      1. Decode image
      2. Detect faces
      3. Classify mask for each face
      4. Annotate frame
      5. Save violation screenshot if "No Mask" detected and cooldown elapsed
      6. Return detections + base64 annotated image + optional violation filename
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return [], "", None

    face_boxes = _detect_faces(frame)
    detections: List[Detection] = []

    if face_boxes:
        faces = []
        for (sX, sY, eX, eY) in face_boxes:
            face = frame[sY:eY, sX:eX]
            if face.size == 0:
                continue
            face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
            face = cv2.resize(face, (224, 224))
            face = img_to_array(face)
            face = preprocess_input(face)
            faces.append(face)

        if faces:
            faces_array = np.array(faces, dtype="float32")
            preds = mask_net.predict(faces_array, batch_size=32, verbose=0)

            for (box, pred) in zip(face_boxes, preds):
                (sX, sY, eX, eY) = box
                (mask_prob, no_mask_prob) = pred
                mask_prob    = float(mask_prob)
                no_mask_prob = float(no_mask_prob)

                # ── 3-way confidence-gated classification ──────────────────
                # Only label confidently if the winning class exceeds the
                # threshold. Otherwise flag as "Uncertain / Improper Mask".
                if mask_prob >= MASK_CONFIDENCE_THRESHOLD:
                    label      = "Mask"
                    confidence = mask_prob
                    color      = (0, 255, 0)          # green — confirmed safe
                elif no_mask_prob >= MASK_CONFIDENCE_THRESHOLD:
                    label      = "No Mask"
                    confidence = no_mask_prob
                    color      = (0, 0, 255)          # red — confirmed violation
                else:
                    # Ambiguous prediction — hand, scarf, improper mask, etc.
                    label      = "Uncertain"
                    confidence = float(max(mask_prob, no_mask_prob))
                    color      = (0, 200, 255)        # yellow-orange (BGR)

                # Draw bounding box and label
                cv2.rectangle(frame, (sX, sY), (eX, eY), color, 2)
                display_label = "Uncertain / Improper" if label == "Uncertain" else label
                text = f"{display_label}: {confidence * 100:.1f}%"
                y_pos = sY - 10 if sY - 10 > 10 else sY + 20
                cv2.putText(frame, text, (sX, y_pos),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.50, color, 2)

                detections.append(Detection(
                    label=label,
                    confidence=round(confidence, 4),
                    bbox=[sX, sY, eX, eY],
                ))

    # Save violation only for confirmed "No Mask" — Uncertain is NOT treated as
    # a violation to avoid false-positive screenshots from hands/scarves.
    violation_filename: Optional[str] = None
    if any(d.label == "No Mask" for d in detections):
        violation_filename = _save_violation(frame)

    # Encode annotated frame to base64
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    image_b64 = base64.b64encode(buffer).decode("utf-8")

    return detections, image_b64, violation_filename
