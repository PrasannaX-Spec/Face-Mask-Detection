# 🛡️ Real-Time AI Face Mask Detection System

> A full-stack, AI-powered face mask compliance system with a FastAPI backend, React frontend, live webcam streaming, and static image upload detection.

---

## 📌 Overview

This project detects whether individuals are wearing face masks in real time. It integrates two deep learning models — a **Caffe SSD face detector** and a **MobileNetV2-based mask classifier** — into a production-style web application. The system supports both **live webcam streaming via WebSocket** and **static image upload** for detection, served through a modern React UI with dark glassmorphism design.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **Authentication** | Token-based login. All routes are protected. Auto-logout on session expiry. |
| 🏠 **Dashboard** | Welcome screen with navigation to Live Detection and Image Upload modes. |
| 🎥 **Live Webcam Detection** | Optimized streaming pipeline with frame throttling (~8fps), capped resolution, and decoupled UI rendering for smooth video. |
| 📤 **Image Upload Detection** | Drag & drop or select an image. Returns annotated result + detection list. |
| 🚨 **Violation Logging** | Auto-saves screenshots to `violations/` when a no-mask face is detected. |
| 🤷 **Confidence Gating** | 3-way classification: Mask, No Mask, and "Uncertain / Improper" (for predictions <95%) to reduce false positives. |
| 🔇 **Cooldown System** | 3-second cooldown prevents duplicate violation saves/alerts. |
| 🔊 **Audio Alerts** | System beep (standalone) and automated Voice Assistant (web) on detection state changes. |
| 📊 **Detection Summary** | Total faces, mask count, no-mask count, uncertain count, confidence per face. |

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                          │
│         React + Vite + Tailwind CSS + Framer Motion           │
│                       (port 5173)                              │
│                                                                │
│   LoginPage  →  DashboardPage  →  UploadPage / LiveCameraPage  │
└──────────────────────┬──────────────────────────┬─────────────┘
                       │ HTTP REST                │ WebSocket
                       ▼                          ▼
┌────────────────────────────────────────────────────────────────┐
│                  FastAPI Backend  (port 8000)                   │
│                                                                │
│   POST /login          →  auth.py   (token issuance)          │
│   POST /detect/image   →  inference.py (image analysis)       │
│   WS   /detect/live    →  inference.py (frame-by-frame)       │
│                                                                │
│   ┌─────────────────────────────────────────────────────┐     │
│   │              inference.py Pipeline                  │     │
│   │  bytes → decode → Caffe SSD face detect             │     │
│   │       → crop ROIs → MobileNetV2 classify            │     │
│   │       → annotate frame → save violation             │     │
│   │       → encode base64 → return JSON                 │     │
│   └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┬─────────┘
                                                       │
                                               ┌───────▼──────────┐
                                               │  Local Filesystem │
                                               │  mask_detector.model │
                                               │  face_detector/   │
                                               │  violations/      │
                                               └───────────────────┘
```

---

## 🤖 AI / Machine Learning Pipeline

### Stage 1 — Face Detection (Caffe SSD)

| Property | Value |
|---|---|
| Model | ResNet-10 Single Shot Detector (SSD) |
| Framework | OpenCV DNN (`cv2.dnn.readNet`) |
| Input Size | 224 × 224 |
| Confidence Threshold | > 50% |
| Output | Bounding box `[startX, startY, endX, endY]` |

### Stage 2 — Mask Classification (MobileNetV2)

| Property | Value |
|---|---|
| Base Model | MobileNetV2 (pretrained on ImageNet) |
| Custom Head | AveragePooling2D → Flatten → Dense(128, ReLU) → Dropout(0.5) → Dense(2, Softmax) |
| Input | 224 × 224 × 3 (RGB), `preprocess_input` normalized |
| Output | `[mask_prob, no_mask_prob]` |
| Confidence Gate | Winning class must be ≥ 95% threshold, otherwise "Uncertain" |
| Labels | **Mask** (green box) / **No Mask** (red box) / **Uncertain** (yellow box) |

### Stage 3 — Model Training (`train_mask_detector.py`)

| Parameter | Value |
|---|---|
| Dataset | `dataset/with_mask/` + `dataset/without_mask/` |
| Split | 80% train / 20% test (stratified) |
| Augmentation | Rotation ±20°, Zoom 15%, Shift 20%, Horizontal Flip |
| Optimizer | Adam (`lr=1e-4`, decay per epoch) |
| Loss | Binary Cross-Entropy |
| Epochs | 20 |
| Batch Size | 32 |
| Base Layers | Frozen (transfer learning) |
| Output | `mask_detector.model` (H5, 11 MB) |

---

## 🛠️ Technology Stack

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
| **Styling** | Tailwind CSS v4 + Vanilla CSS (Glassmorphism) |
| **Animations** | Framer Motion |
| **State Management** | Zustand + localStorage |
| **HTTP Client** | Axios (with interceptors) |
| **Notifications** | Sonner |
| **Icons** | Lucide React |
| **Language** | Python 3.x + TypeScript |

---

## 📂 Project Structure

```
Face-Mask-Detection/
│
├── backend/                    ← FastAPI server
│   ├── main.py                 ← API routes
│   ├── auth.py                 ← Token-based authentication
│   ├── inference.py            ← ML inference pipeline
│   ├── models.py               ← Pydantic schemas
│   └── requirements.txt
│
├── frontend/                   ← React web application
│   ├── src/
│   │   ├── api/client.ts       ← Axios + interceptors
│   │   ├── store/authStore.ts  ← Zustand auth state
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── LiveCameraPage.tsx
│   │   │   └── UploadPage.tsx
│   │   └── components/
│   │       ├── Navbar.tsx
│   │       └── ProtectedRoute.tsx
│   └── vite.config.ts
│
├── face_detector/              ← Pre-trained Caffe SSD model
│   ├── deploy.prototxt
│   └── res10_300x300_ssd_iter_140000.caffemodel
│
├── mask_detector.model         ← Trained Keras model (11 MB)
├── detect_mask_video.py        ← Standalone webcam script
├── train_mask_detector.py      ← Model training script
├── dataset/                    ← Training images
│   ├── with_mask/
│   └── without_mask/
├── violations/                 ← Auto-saved violation screenshots
├── FINAL_REPORT.md             ← Detailed project report
└── requirements.txt
```

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.8+
- Node.js 18+ and npm
- A webcam (for live detection)

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Face-Mask-Detection
```

### 2. Set Up Python Virtual Environment
```powershell
python -m venv venv
.\venv\Scripts\activate
```

### 3. Install Backend Dependencies
```powershell
pip install -r backend/requirements.txt
```

### 4. Install Frontend Dependencies
```powershell
cd frontend
npm install
```

---

## ▶️ Running the Application

### Full Web Application (Recommended)

**Terminal 1 — Start the Backend:**
```powershell
cd D:\ML-Project\Face-Mask-Detection
.\venv\Scripts\activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Start the Frontend:**
```powershell
cd D:\ML-Project\Face-Mask-Detection\frontend
npm run dev
```

Open your browser at **`http://localhost:5173`**

> **Default credentials:** `admin` / `admin@123`

### Standalone Webcam Script (No Browser Needed)
```powershell
cd D:\ML-Project\Face-Mask-Detection
.\venv\Scripts\activate
python detect_mask_video.py
```
Press **`q`** to quit.

---

## 🌐 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/login` | ❌ | Login with username + password, returns token |
| `POST` | `/detect/image` | ✅ Bearer | Upload image → annotated image + detections |
| `WebSocket` | `/detect/live` | ✅ Token param | Stream frames → receive annotated results |

Auto-generated docs available at: **`http://localhost:8000/docs`**

---

## 🔐 Security

- UUID token issued at login, stored in browser `localStorage`
- All protected routes check the token via `Authorization: Bearer <token>` header
- CORS restricted to `http://localhost:5173`
- WebSocket token validated **before** `websocket.accept()`
- Axios 401 interceptor auto-clears the stale token and redirects to login

---

## 📸 Violation Logging

When a **"No Mask"** detection occurs:
1. A screenshot is automatically saved to `violations/<unix_timestamp>.jpg`
2. A 3-second cooldown prevents duplicate saves
3. In standalone mode, a `winsound.Beep` audio alert fires simultaneously

---

## ⚠️ Known Limitations

| Limitation | Suggested Fix |
|---|---|
| In-memory token store lost on server restart | Use Redis or a database |
| Single hardcoded admin account | Add user DB with bcrypt hashed passwords |
| No HTTPS | Add SSL/TLS for production |
| No violations UI | Add a "Violations Gallery" page |
| No analytics | Add compliance rate charts over time |
| Basic binary mask detection | **Mask Fashion / Type Classifier:** Detect mask styles (N95, Surgical, Cloth) |
| AI Voice Assistant | **Implemented!** Web Speech API triggers automated voice instructions on state change. |
| High Latency in Streaming | **Fixed!** Implemented decoupled rendering and frame throttling. |
| False Positives for Hands/Scarves | **Fixed!** Added a 95% confidence gate (Uncertain class). |

---

## 📄 License

This project is for educational and demonstration purposes.
