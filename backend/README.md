# AEGIS Ground Station Relay & RTSP Streaming Server

This service provides an edge-to-ground telemetry bridge and RTSP video ingestion server for the AEGIS Autonomous Experiment Guidance & Interaction System (Smart India Hackathon 2026, PS SIH26174).

---

## 1. Architecture Overview

```
[ Browser / Edge Client ]
   │
   ├─► WebSocket (/ws/stream) ──► FFmpeg stdin ──► RTSP stream (rtsp://localhost:8554/aegis) ──► MediaMTX
   │                                                                                               │
   └─► REST API (POST /api/log) ──► Append JSONL on ground disk                                  Mission Control
```

---

## 2. Prerequisites

- Python 3.10+
- FFmpeg installed (`sudo apt install ffmpeg` or `brew install ffmpeg`)
- MediaMTX (RTSP streaming server)

---

## 3. Quick Start

### Step 1: Start MediaMTX (RTSP server)
Download and run MediaMTX binary:
```bash
./mediamtx
```
MediaMTX will bind to `rtsp://localhost:8554` and `http://localhost:8889` (WebRTC/HLS).

### Step 2: Install Python dependencies
```bash
cd backend
pip install fastapi uvicorn pydantic
```

### Step 3: Run the FastAPI Relay
```bash
python main.py
```
Or with Uvicorn directly:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 4. Endpoints

- `GET /`: Health check and status.
- `GET /api/protocol`: Synchronized experiment protocol.
- `POST /api/log`: Ingest verified experiment event log.
- `GET /api/logs`: Query stored event history.
- `WS /ws/stream`: Binary WebSocket endpoint receiving WebM video slices and piping to FFmpeg RTSP out.

---

## 5. Offline & Fallback Operation

When the Ground Relay server is unreachable, the AEGIS frontend automatically switches to local memory and browser IndexedDB storage with zero interruption to on-board experiment verification. The UI displays `Ground link: local only` until the link is restored.
