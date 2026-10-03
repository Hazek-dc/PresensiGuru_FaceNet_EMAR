from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
import threading


def _warm_engine():
    from routers.attendance import get_engine
    try:
        get_engine()
        print("Mesin biometrik siap (model FaceNet + dlib dimuat).", flush=True)
    except Exception as e:
        print(f"Memuat mesin biometrik di awal gagal, dicoba lagi saat permintaan pertama: {e}", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Model FaceNet + dlib butuh ~30-40 s untuk dimuat. Tanpa ini, presensi
    # pertama setelah mesin dinyalakan (atau dimuat ulang) menunggu selama itu.
    # BIOMETRIC_WARMUP=0 mematikannya (dipakai tes).
    if os.environ.get("BIOMETRIC_WARMUP", "1") != "0":
        threading.Thread(target=_warm_engine, name="warmup", daemon=True).start()
    yield


app = FastAPI(title="Biometric Attendance API", version="1.0.0", lifespan=lifespan)

# Setup CORS (Only allow Laravel frontend for security)
# We will use environment variables for this in production, but for now allow localhost
origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://localhost",
    "https://localhost:8000",
    "http://localhost:5173", # Vite dev server
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class EnrollmentResponse(BaseModel):
    success: bool
    message: str
    embedding_id: str | None = None

class AttendanceResponse(BaseModel):
    success: bool
    message: str
    score: float | None = None
    liveness_passed: bool | None = None

@app.get("/")
def read_root():
    return {"message": "Biometric API is running"}

from routers import enrollment, attendance, measure

app.include_router(attendance.router, tags=["AttendanceRoot"])
app.include_router(enrollment.router, tags=["EnrollmentRoot"])
app.include_router(measure.router, tags=["MeasureRoot"])
app.include_router(enrollment.router, prefix="/api", tags=["Enrollment"])
app.include_router(attendance.router, prefix="/api", tags=["Attendance"])
app.include_router(measure.router, prefix="/api", tags=["Measure"])

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
