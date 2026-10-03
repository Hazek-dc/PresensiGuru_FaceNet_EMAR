from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import os
import shutil
import sys
import threading

router = APIRouter()

class AttendanceResponse(BaseModel):
    success: bool
    status: str
    message: str
    score: float | None = None
    facenet_score: float | None = None
    emar_score: float | None = None
    distance: float | None = None
    euclidean_distance: float | None = None
    is_verified: bool | None = None
    fta: bool = False
    fta_reason: str | None = None
    liveness_passed: bool | None = None
    blink_cycles: int | None = None
    mouth_cycles: int | None = None
    video_seconds: float | None = None
    # Rasio lebar wajah untuk jarak kamera; tidak ikut keputusan verifikasi.
    face_width_ratio: float | None = None
    face_width_frames: int | None = None
    frame_width: int | None = None
    frame_height: int | None = None
    request_id: str | None = None

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "storage", "temp_video")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

_engine = None
_engine_lock = threading.Lock()


def get_engine():
    """
    Mesin FaceNet + EMAR dari facenet_emar_system, dimuat sekali per proses.
    Fungsi verify_video_file selalu mereferensikan modul facenet_emar_system terkini.
    """
    global _engine
    with _engine_lock:
        if ROOT_DIR not in sys.path:
            sys.path.insert(0, ROOT_DIR)
        import facenet_emar_system
        if _engine is None:
            _engine = facenet_emar_system.FaceEMARSystem()
        return _engine, facenet_emar_system.verify_video_file


@router.post("/verify", response_model=AttendanceResponse)
def verify_attendance(
    attempt_id: str = Form(None),
    teacher_id: str = Form(None),
    user_id: str = Form(None),
    subject_id: str = Form(None),
    claimed_id: str = Form(None),
    video: UploadFile = File(...)
):
    """
    Verifikasi rekaman presensi: FaceNet 1:1 terhadap galeri dan liveness EMAR,
    memakai logika yang sama dengan Flask /verify (verify_video_file).
    """
    target_id = teacher_id or user_id or subject_id or claimed_id
    req_id = attempt_id or "att-" + os.urandom(6).hex()
    if not target_id:
        raise HTTPException(status_code=400, detail="Teacher ID / User ID is required")

    try:
        system, verify_video_file = get_engine()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Mesin biometrik tidak dapat dimuat: {e}")

    file_path = os.path.join(UPLOAD_DIR, f"{req_id}_{os.path.basename(video.filename or 'video')}")
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
        result = verify_video_file(system, file_path, target_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

    result["request_id"] = req_id
    return AttendanceResponse(
        success=result["status"] == "success",
        score=result["facenet_score"],
        **result,
    )
