# 🛡️ Real-Time AI Face Mask Detection System — Final Project Report

> **Project Location:** `D:\ML-Project\Face-Mask-Detection`
> **Report Date:** April 28, 2026

---

## 1. Executive Summary

This project is a **full-stack, AI-powered Face Mask Compliance System** designed to detect whether individuals are wearing face masks in real time. It integrates two deep learning models — a **Caffe SSD face detector** and a **MobileNetV2-based mask classifier** — into a production-style web application with a FastAPI backend and a React frontend. It supports both **live webcam streaming** and **static image upload** for detection.

The system is built for real-world deployment scenarios such as office entrances, hospitals, or public surveillance points where mask compliance must be monitored automatically.

---

## 2. What the System Does — Feature Overview

### 🔐 2.1 Authentication
- Users must **log in** with a username and password before accessing any feature.
- A **UUID-based session token** is issued upon successful login and stored securely in `localStorage`.
- All protected routes (Dashboard, Live Detection, Upload) require a valid token.
- If the backend restarts (token invalidated), users are **automatically redirected to login** — no manual action needed.

### 🏠 2.2 Dashboard
- Displays a welcome screen with the logged-in **username**.
- Provides two clearly labeled navigation cards:
  - **Live Detection** — webcam-based real-time detection
  - **Image Upload** — static photo analysis
- Shows system metadata: Model name (MobileNetV2), Face Detector (Caffe SSD), minimum confidence threshold (>50%).

### 🎥 2.3 Live Webcam Detection (Real-Time)
- Accesses the user's **webcam via the browser**.
- **Optimized streaming pipeline**: frames are capped at 640px wide and sent at ~8 FPS over a **WebSocket connection** to prevent network queue buildup.
- Stale frames are dropped client-side if the backend is busy computing a frame.
- The UI decouples raw video rendering from detection box drawing using a `requestAnimationFrame` live canvas loop, ensuring perfectly smooth local video playback.
- Displays a live **detection overlay** with label (Mask, No Mask, Uncertain) + confidence % per face.
- Includes a built-in **Voice Assistant** that reads out compliance instructions based on the detection state.

### 📤 2.4 Image Upload Detection
- User drags & drops or selects an image (PNG, JPG, WEBP, max 10MB).
- Image is sent to the backend via HTTP POST (`/detect/image`).
- The annotated result image is displayed side-by-side with:
  - **Detection Summary** — total faces, mask count, no-mask count
  - **Face Results List** — each face with label, confidence %, and bounding box coordinates.

### 🚨 2.5 Violation Logging (Backend)
- When a **"No Mask"** face is detected, the system automatically saves a **screenshot** of the frame to the `violations/` folder.
- A **3-second cooldown** prevents duplicate saves for the same violation event.
- Saved as: `violations/<unix_timestamp>.jpg`

### 🔊 2.6 Audio Alert (Standalone Mode Only)
- In the standalone `detect_mask_video.py` script, a **system beep** (`winsound.Beep`) sounds whenever a no-mask violation is detected, also with a 3-second cooldown.

---

## 3. System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                          │
│                                                                │
│  React + Vite + Tailwind CSS + Framer Motion (port 5173)      │
│                                                                │
│  ┌──────────┐   ┌────────────────┐   ┌──────────────────────┐ │
│  │ LoginPage│   │  DashboardPage │   │  UploadPage /        │ │
│  │          │   │                │   │  LiveCameraPage      │ │
│  └────┬─────┘   └───────┬────────┘   └──────────┬───────────┘ │
│       │                 │                        │             │
│       │    HTTP POST /login   HTTP POST /detect/image          │
│       │                 │    WS  /detect/live                  │
└───────┼─────────────────┼────────────────────────┼────────────┘
        │                 │                        │
        ▼                 ▼                        ▼
┌────────────────────────────────────────────────────────────────┐
│                    FastAPI BACKEND (port 8000)                  │
│                                                                │
│   auth.py ──► Token validation / UUID session management       │
│   main.py ──► Route definitions (REST + WebSocket)             │
│   inference.py ──► ML inference pipeline                       │
│   models.py ──► Pydantic data schemas                          │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │              inference.py Pipeline                   │    │
│   │  Raw image bytes                                     │    │
│   │      → cv2.imdecode()                                │    │
│   │      → Caffe SSD face detector (224×224 blob)        │    │
│   │      → Extract face ROIs (confidence > 50%)          │    │
│   │      → MobileNetV2 mask classifier (224×224)         │    │
│   │      → Annotate frame (bounding box + label)         │    │
│   │      → Save violation screenshot (if "No Mask")      │    │
│   │      → Encode to base64 JPEG                         │    │
│   │      → Return detections + image                     │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────┐
│    Local Filesystem            │
│                                │
│  mask_detector.model (11 MB)   │  ← Keras H5 model
│  face_detector/                │  ← Caffe SSD weights
│    deploy.prototxt             │
│    res10_300x300_ssd_...model  │
│  violations/                   │  ← Auto-saved screenshots
│    <timestamp>.jpg             │
└────────────────────────────────┘
```

---

## 4. AI / Machine Learning Pipeline

### 4.1 Stage 1 — Face Detection (Caffe SSD)

| Property | Value |
|---|---|
| Model | ResNet-10 Single Shot Detector (SSD) |
| Framework | OpenCV DNN (`cv2.dnn.readNet`) |
| Input Size | 224 × 224 pixels |
| Mean Subtraction | (104.0, 177.0, 123.0) — BGR mean |
| Confidence Threshold | > 0.50 (50%) |
| Output | Bounding box coordinates `[startX, startY, endX, endY]` |

The Caffe SSD model scans every frame and returns all detected faces with their confidence scores. Only faces with confidence above 50% are processed further.

### 4.2 Stage 2 — Mask Classification (MobileNetV2)

| Property | Value |
|---|---|
| Base Model | MobileNetV2 (pretrained on ImageNet) |
| Framework | TensorFlow / Keras |
| Input Size | 224 × 224 × 3 (RGB) |
| Custom Head | AveragePooling2D → Flatten → Dense(128, ReLU) → Dropout(0.5) → Dense(2, Softmax) |
| Output Classes | `[mask_probability, no_mask_probability]` |
| Decision Rule | Winning probability must be ≥ 95%. Otherwise, "Uncertain". |

Each detected face region is:
1. Cropped from the frame
2. Converted BGR → RGB
3. Resized to 224 × 224
4. Preprocessed with MobileNetV2's built-in `preprocess_input` (scales to `[-1, 1]`)
5. Fed through the mask classifier
6. Labeled as **"Mask"** (green box), **"No Mask"** (red box), or **"Uncertain / Improper"** (yellow box) depending on confidence gating.

### 4.3 Stage 3 — Training (How the Model Was Built)

The `train_mask_detector.py` script built the model from scratch:

| Parameter | Value |
|---|---|
| Dataset | `dataset/with_mask/` + `dataset/without_mask/` |
| Train / Test Split | 80% / 20% (stratified) |
| Augmentation | Rotation ±20°, Zoom 15%, Shift 20%, Horizontal Flip |
| Optimizer | Adam (`lr=1e-4`, decay per epoch) |
| Loss Function | Binary Cross-Entropy |
| Epochs | 20 |
| Batch Size | 32 |
| Base Layers | Frozen (transfer learning only trained the custom head) |
| Final Saved Model | `mask_detector.model` (H5 format, 11 MB) |

---

## 5. Backend — FastAPI Server

**Entry point:** `backend/main.py`  
**Port:** `8000`

### API Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/login` | ❌ | Authenticate with username/password, get token |
| `POST` | `/detect/image` | ✅ Bearer Token | Upload image → get annotated image + detections |
| `WebSocket` | `/detect/live` | ✅ Token (query param) | Stream webcam frames, receive annotated results |

### Authentication Flow (`auth.py`)

```
User sends username + password
    → Validated against hardcoded VALID_USERNAME / VALID_PASSWORD
    → If valid: generate UUID token, store in active_tokens dict
    → If invalid: raise HTTP 401
    
Subsequent requests:
    → Authorization: Bearer <token>
    → verify_token() checks active_tokens dict
    → If not found: raise HTTP 401 → frontend auto-logout
```

> **Note:** The current implementation uses a simple in-memory token store. Tokens are lost if the server restarts.

### Data Models (`models.py`)

```python
Detection:
    label: str              # "Mask" or "No Mask"
    confidence: float       # 0.0 – 1.0
    bbox: List[int]         # [startX, startY, endX, endY]

ImageDetectionResponse:
    detections: List[Detection]
    image_b64: str          # base64-encoded annotated JPEG

LiveDetectionResponse:
    detections: List[Detection]
    image_b64: str
    violation_saved: bool
    violation_filename: Optional[str]
```

---

## 6. Frontend — React Web Application

**Framework:** React 18 + Vite  
**Port:** `5173`  
**Styling:** Tailwind CSS v4 + Custom CSS (glassmorphism design)  
**Animations:** Framer Motion  
**State Management:** Zustand (with localStorage persistence)  
**HTTP Client:** Axios (with request + response interceptors)  
**Notifications:** Sonner toast library

### Page Structure

```
/login          → LoginPage.tsx       (public)
/               → DashboardPage.tsx   (protected)
/live           → LiveCameraPage.tsx  (protected)
/upload         → UploadPage.tsx      (protected)
*               → Redirect to /
```

### Design System

The UI uses a **dark glassmorphism theme** with:
- Background: `#0B0F19` (near-black navy)
- Glass cards: `rgba(255,255,255,0.04)` with `backdrop-filter: blur(20px)`
- Accent gradient: Purple (`#7C3AED`) → Blue (`#2563EB`)
- Typography: Inter (Google Fonts)
- Animated gradient borders, glow effects, micro-animations on hover

### Key Frontend Components

| Component | Purpose |
|---|---|
| `ProtectedRoute` | Redirects unauthenticated users to `/login` |
| `Navbar` | Logo, username display, back button, logout button |
| `authStore` (Zustand) | Persists token + username in localStorage |
| `api/client.ts` | Axios instance with auto-token injection + auto-logout on 401 |

---

## 7. Standalone Mode — `detect_mask_video.py`

This is the original command-line version of the project — no browser needed.

| Feature | Detail |
|---|---|
| Input | Default webcam (`src=0`) |
| Display | OpenCV window (`cv2.imshow`) |
| Output | Live annotated video feed |
| Alert | `winsound.Beep(1000, 500)` — system beep on violation |
| Screenshot | Saved to `violations/<timestamp>.jpg` |
| Cooldown | 3 seconds between consecutive alerts |
| Quit | Press `q` key |

---

## 8. Technology Stack Summary

| Layer | Technology |
|---|---|
| **ML Framework** | TensorFlow 2.x / Keras |
| **Computer Vision** | OpenCV (cv2) |
| **Face Detection** | Caffe ResNet-10 SSD |
| **Mask Classifier** | MobileNetV2 (Transfer Learning) |
| **Backend** | FastAPI + Uvicorn |
| **Real-Time Comms** | WebSocket (via FastAPI) |
| **Data Validation** | Pydantic v2 |
| **Frontend Framework** | React 18 + Vite |
| **Styling** | Tailwind CSS v4 + Vanilla CSS |
| **Animations** | Framer Motion |
| **State Management** | Zustand + localStorage |
| **HTTP Client** | Axios |
| **Notifications** | Sonner |
| **Icons** | Lucide React |
| **Language** | Python 3.x + TypeScript |

---

## 9. Complete Data Flow — Step by Step

### Image Upload Detection Flow

```
1. User selects an image in the browser (drag & drop or file picker)
2. Frontend previews the image locally (URL.createObjectURL)
3. User clicks "Detect Masks"
4. Axios sends POST /detect/image with:
      - Authorization: Bearer <token>
      - Body: multipart/form-data with the image file
5. FastAPI receives the request, validates the token
6. inference.py:
      a. Decodes bytes → numpy array → OpenCV frame
      b. Creates 224×224 blob → runs Caffe SSD face detection
      c. For each face (confidence > 50%):
           - Crops face ROI
           - Converts to RGB, resizes to 224×224
           - Applies MobileNetV2 preprocessing
      d. Batch-predicts all faces in one call to mask_net.predict()
      e. For each face: picks label (Mask/No Mask), draws colored rectangle + text
      f. If any "No Mask": saves frame to violations/ (3s cooldown)
      g. Encodes annotated frame as base64 JPEG
7. FastAPI returns JSON: { detections: [...], image_b64: "..." }
8. Frontend:
      a. Replaces preview with annotated image
      b. Shows detection summary (total, mask count, no-mask count)
      c. Lists each face with label, confidence, bbox coordinates
      d. Shows success toast notification
```

### Live Webcam Detection Flow

```
1. User navigates to /live
2. Browser requests webcam access (getUserMedia)
3. Frontend opens WebSocket connection to ws://localhost:8000/detect/live?token=<token>
4. Backend validates token before accepting the connection
5. Frontend throttling: At ~8 FPS, browser checks if backend is busy. If busy, drop frame.
6. If not busy, frame is scaled to max 640px, drawn to offscreen canvas, exported as JPEG blob, and sent via WebSocket.
7. Backend inference pipeline runs (extracts bounding boxes + labels).
8. Backend sends back JSON text with detections.
9. Frontend receives detections and updates the live canvas overlay at monitor refresh rate (60fps), painting bounding boxes over the perfectly smooth local video feed.
10. Web Speech API triggers automated voice instructions if the overall detection state changes.
```

---

## 10. Security Model

| Concern | Implementation |
|---|---|
| Authentication | UUID token issued at login, required for all protected endpoints |
| Token Storage | Browser localStorage via Zustand persist |
| CORS | Restricted to `http://localhost:5173` only |
| Token Validation | Every request checked against in-memory `active_tokens` dict |
| Auto-Logout | 401 response interceptor in Axios clears token + redirects to login |
| WebSocket Auth | Token passed as query parameter, validated before `websocket.accept()` |

> **Limitation:** The token store is in-memory — server restarts invalidate all sessions. For production, replace with a database-backed or Redis token store.

---

## 11. File Structure Reference

```
Face-Mask-Detection/
│
├── backend/                    ← FastAPI server
│   ├── main.py                 ← API routes (login, detect/image, detect/live)
│   ├── auth.py                 ← Token-based authentication
│   ├── inference.py            ← Full ML inference pipeline
│   ├── models.py               ← Pydantic request/response schemas
│   └── requirements.txt        ← Python dependencies
│
├── frontend/                   ← React web application
│   ├── src/
│   │   ├── api/client.ts       ← Axios instance + interceptors
│   │   ├── store/authStore.ts  ← Zustand auth state (persisted)
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── LiveCameraPage.tsx
│   │   │   └── UploadPage.tsx
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   ├── App.tsx             ← Router definition
│   │   ├── index.css           ← Global styles + design tokens
│   │   └── main.tsx            ← React entry point
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── face_detector/              ← Caffe SSD pre-trained model
│   ├── deploy.prototxt
│   └── res10_300x300_ssd_iter_140000.caffemodel
│
├── mask_detector.model         ← Trained Keras model (11 MB, H5 format)
├── detect_mask_video.py        ← Standalone webcam script (no browser)
├── train_mask_detector.py      ← Model training script
├── dataset/                    ← Training images
│   ├── with_mask/
│   └── without_mask/
├── violations/                 ← Auto-saved violation screenshots
└── requirements.txt            ← Root Python dependencies
```

---

## 12. How to Run

### Full Web Application (Recommended)

**Terminal 1 — Backend:**
```powershell
cd D:\ML-Project\Face-Mask-Detection
.\venv\Scripts\activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```powershell
cd D:\ML-Project\Face-Mask-Detection\frontend
npm run dev
```

Open `http://localhost:5173` → Login: `admin` / `admin@123`

### Standalone Webcam Only
```powershell
cd D:\ML-Project\Face-Mask-Detection
.\venv\Scripts\activate
python detect_mask_video.py
```

---

## 13. Known Limitations & Future Improvements

| Limitation | Suggested Improvement |
|---|---|
| In-memory token store lost on restart | Use Redis or a database for token persistence |
| Single hardcoded admin account | Add a user database with hashed passwords (bcrypt) |
| No HTTPS | Add SSL/TLS for production deployment |
| Violations folder has no web UI | Add a "Violations Gallery" page to browse saved screenshots |
| No analytics dashboard | Add charts showing mask compliance rates over time |
| Basic binary mask detection | **Mask Fashion / Type Classifier:** Upgrade model to differentiate mask styles (N95 vs. Surgical vs. Cloth) |
| AI Voice Assistant | **Implemented!** Spoken audio instructions integrated in the live webcam browser interface. |
| High Latency in Streaming | **Fixed!** Implemented decoupled UI rendering and frame throttling. |
| False Positives for Hands/Scarves | **Fixed!** Added a 95% confidence gate (Uncertain class). |
