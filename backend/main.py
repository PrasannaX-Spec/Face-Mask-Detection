from fastapi import FastAPI, Depends, File, UploadFile, WebSocket, WebSocketDisconnect, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import json

from models import LoginRequest, LoginResponse, ImageDetectionResponse, LiveDetectionResponse
from auth import authenticate, verify_token, active_tokens
from inference import load_models, run_inference


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_models()
    yield


app = FastAPI(title="Face Mask Detection API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    token = authenticate(body.username, body.password)
    return LoginResponse(token=token, username=body.username)


# ---------------------------------------------------------------------------
# Image upload detection
# ---------------------------------------------------------------------------

def _get_token_from_header(authorization: str = Header(...)) -> str:
    """Extract Bearer token from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return verify_token(authorization.split(" ", 1)[1])


@app.post("/detect/image", response_model=ImageDetectionResponse)
async def detect_image(
    file: UploadFile = File(...),
    username: str = Depends(_get_token_from_header),
):
    image_bytes = await file.read()
    detections, image_b64, _ = run_inference(image_bytes)
    return ImageDetectionResponse(detections=detections, image_b64=image_b64)


# ---------------------------------------------------------------------------
# WebSocket live detection
# ---------------------------------------------------------------------------

@app.websocket("/detect/live")
async def detect_live(websocket: WebSocket, token: str):
    # Validate token before accepting the connection
    if token not in active_tokens:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    try:
        while True:
            # Receive raw image bytes from the browser canvas
            image_bytes = await websocket.receive_bytes()
            detections, image_b64, _ = run_inference(image_bytes)

            response = LiveDetectionResponse(
                detections=detections,
                image_b64=image_b64,
            )
            await websocket.send_text(response.model_dump_json())
    except WebSocketDisconnect:
        pass
