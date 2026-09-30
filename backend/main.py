"""
AEGIS Ground Relay Server
FastAPI Ground Station Relay for Telemetry & RTSP Video Streaming
Smart India Hackathon 2026 - Team Mavira52 (PS SIH26174)
"""

import json
import os
import subprocess
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

app = FastAPI(
    title="AEGIS Ground Telemetry & Stream Relay",
    description="Edge-to-Ground Relay for On-Board Biological Experiment Interaction System",
    version="1.0.0"
)

# Enable CORS for local web interface
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LOG_FILE = "ground_telemetry.jsonl"
RTSP_TARGET = os.getenv("RTSP_TARGET", "rtsp://localhost:8554/aegis")

class TelemetryLogEntry(BaseModel):
    timestamp: str
    step: int
    action: str
    expected: str
    status: str
    confidence: float
    errorType: Optional[str] = None
    latencyMs: Optional[float] = None
    runType: Optional[str] = None
    alertReview: Optional[str] = None
    components: Optional[Dict[str, float]] = None

@app.get("/")
def health_check():
    return {
        "status": "nominal",
        "service": "AEGIS Ground Relay",
        "timestamp": datetime.utcnow().isoformat(),
        "rtsp_target": RTSP_TARGET
    }

@app.get("/api/protocol")
def get_current_protocol():
    """Returns the synchronized payload protocol specification"""
    return {
        "id": "protocol-bas-01",
        "name": "Space Biology Payload: Object Transfer Protocol",
        "version": "1.0",
        "steps": [
            {"id": 1, "name": "OPEN_BOX", "type": "OPEN", "object": "box", "voice": "Please open the box."},
            {"id": 2, "name": "PICK_RED", "type": "PICK", "object": "red", "voice": "Please pick the red object."},
            {"id": 3, "name": "PLACE_RED", "type": "PLACE", "object": "red", "voice": "Please place the red object in the target zone."},
            {"id": 4, "name": "PICK_YELLOW", "type": "PICK", "object": "yellow", "voice": "Please pick the yellow object."},
            {"id": 5, "name": "PLACE_YELLOW", "type": "PLACE", "object": "yellow", "voice": "Please place the yellow object in the target zone."}
        ],
        "preconditions": ["Box closed", "Red and yellow inside box", "Target zone empty"],
        "postconditions": ["Box open", "Red and yellow in TARGET_ZONE"]
    }

@app.post("/api/log")
def append_log_entry(entry: TelemetryLogEntry):
    """Appends verified experiment event log to JSONL disk storage"""
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry.dict()) + "\n")
        return {"saved": True, "timestamp": entry.timestamp}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/logs")
def fetch_recent_logs(limit: int = 100):
    """Retrieves stored logs from disk"""
    if not os.path.exists(LOG_FILE):
        return []
    records = []
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    records.append(json.loads(line))
                except Exception:
                    continue
    return records[-limit:]

@app.websocket("/ws/stream")
async def websocket_stream_endpoint(websocket: WebSocket):
    """
    Receives raw WebM / H.264 video chunks from client MediaRecorder
    and pipes them to ffmpeg stdin to stream out as RTSP for MediaMTX / Mission Control.
    """
    await websocket.accept()
    ffmpeg_process = None

    try:
        # Launch FFmpeg process to mux webm stream to RTSP
        ffmpeg_cmd = [
            "ffmpeg",
            "-re",
            "-i", "pipe:0",
            "-c:v", "copy",
            "-f", "rtsp",
            "-rtsp_transport", "tcp",
            RTSP_TARGET
        ]

        try:
            ffmpeg_process = subprocess.Popen(
                ffmpeg_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        except FileNotFoundError:
            # Fallback when ffmpeg is not installed in local environment
            ffmpeg_process = None

        while True:
            data = await websocket.receive_bytes()
            if ffmpeg_process and ffmpeg_process.stdin:
                try:
                    ffmpeg_process.stdin.write(data)
                    ffmpeg_process.stdin.flush()
                except (BrokenPipeError, IOError):
                    break

    except WebSocketDisconnect:
        pass
    finally:
        if ffmpeg_process:
            try:
                ffmpeg_process.stdin.close()
                ffmpeg_process.terminate()
            except Exception:
                pass
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
