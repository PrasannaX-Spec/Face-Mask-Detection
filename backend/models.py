from pydantic import BaseModel
from typing import List, Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class Detection(BaseModel):
    label: str           # "Mask" | "No Mask" | "Uncertain"
    confidence: float    # 0.0 - 1.0  (winning class probability)
    bbox: List[int]      # [startX, startY, endX, endY]


class ImageDetectionResponse(BaseModel):
    detections: List[Detection]
    image_b64: str       # base64-encoded annotated image


class LiveDetectionResponse(BaseModel):
    detections: List[Detection]
    image_b64: str
    violation_saved: bool = False       # True when a screenshot was persisted
    violation_filename: Optional[str] = None  # e.g. "1714290000.jpg"
