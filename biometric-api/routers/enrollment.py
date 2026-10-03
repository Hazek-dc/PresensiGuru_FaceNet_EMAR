from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.datastructures import UploadFile as StarletteUploadFile
from typing import Any, Dict, List, Optional, Tuple
import os
import sys
import threading
import time
import uuid
import cv2
import numpy as np

router = APIRouter()

class EnrollmentResponse(BaseModel):
    success: bool
    message: str
    embedding_id: Optional[str] = None
    subject_id: Optional[str] = None
    template_hash: Optional[str] = None
    n_frames: Optional[int] = None
    backup: Optional[str] = None
    error: Optional[str] = None

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from routers.attendance import get_engine

# Pratinjau web: template baru hanya boleh disimpan bila wajah terdeteksi
# pada minimal MIN_ENROLL_FRAMES gambar.
MIN_ENROLL_FRAMES = 3
MAX_ENROLL_FILES = 10
PREVIEW_TTL_S = 15 * 60
PREVIEW_MAX_ENTRIES = 50
# Sampel tambahan (cahaya/jarak lain) hanya digabung bila masih dekat dengan
# template lama. Wajah asli lintas kondisi terukur <= 0,72 (lintas perangkat),
# wajah orang lain >= 0,95; 0,80 mencegah wajah orang lain tercampur ke template.
APPEND_MAX_DISTANCE = 0.80

# Template hasil pratinjau menunggu konfirmasi di memori proses, bukan di galeri.
# Restart mesin menghapus pratinjau; pengguna cukup mengulang pratinjau.
_previews: Dict[str, Dict[str, Any]] = {}
_previews_lock = threading.Lock()
_clock = time.monotonic


def _alias_keys(subject_id: str) -> Tuple[str, str]:
    """ID bersih dan bentuk emb_; keduanya disimpan agar verifikasi menemukan template."""
    clean_id = subject_id[4:] if subject_id.startswith("emb_") else subject_id
    prefixed_id = subject_id if subject_id.startswith("emb_") else f"emb_{subject_id}"
    return clean_id, prefixed_id


def _form_subject_id(form, *explicit: Optional[str]) -> Optional[str]:
    for value in explicit:
        if value:
            return value
    for key in ("subject_id", "teacher_id", "user_id"):
        value = form.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _uploads(form) -> List[StarletteUploadFile]:
    return [value for key in form.keys() for value in form.getlist(key)
            if isinstance(value, StarletteUploadFile)]


async def _read_all(uploads: List[StarletteUploadFile]) -> List[bytes]:
    return [await upload.read() for upload in uploads]


def _decode_images(contents: List[bytes]) -> List[np.ndarray]:
    images = []
    for content in contents:
        if not content:
            continue
        try:
            img = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
        except cv2.error:
            img = None
        if img is not None:
            images.append(img)
    return images


def _fail(status: int, message: str, error: str, **extra: Any) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"success": False, "message": message, "error": error, **extra})


def _purge_expired(now: float) -> None:
    for token in [t for t, p in _previews.items() if now - p["created_at"] >= PREVIEW_TTL_S]:
        del _previews[token]


def _stage(entry: Dict[str, Any]) -> str:
    token = uuid.uuid4().hex
    with _previews_lock:
        now = _clock()
        _purge_expired(now)
        while len(_previews) >= PREVIEW_MAX_ENTRIES:
            # Urutan sisip dict terjaga: kunci pertama adalah pratinjau tertua.
            del _previews[next(iter(_previews))]
        entry["created_at"] = now
        _previews[token] = entry
    return token


async def _read_body(request: Request) -> Dict[str, Any]:
    if "application/json" in request.headers.get("content-type", "").lower():
        try:
            data = await request.json()
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}
    form = await request.form()
    return {k: v for k, v in form.items() if isinstance(v, str)}


@router.post("/enroll", response_model=EnrollmentResponse)
async def enroll_face(
    request: Request,
    subject_id: Optional[str] = Form(None),
    teacher_id: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    name: Optional[str] = Form(""),
    dept: Optional[str] = Form(""),
    session_tag: Optional[str] = Form("manual_enrollment"),
):
    """
    Daftarkan atau perbarui template wajah FaceNet 512-D ke dalam galeri biometrik.
    Mendukung input multi-frame dari web capture (files[]), memvalidasi MTCNN,
    menghitung mean embedding ternormalisasi L2, dan menyimpan ke face_gallery.pkl
    setelah galeri lama dicadangkan.
    """
    form = await request.form()
    actual_id = _form_subject_id(form, subject_id, teacher_id, user_id)
    if not actual_id:
        raise HTTPException(status_code=400, detail="subject_id / teacher_id / user_id diperlukan")

    uploads = _uploads(form)
    if not uploads:
        raise HTTPException(status_code=400, detail="Tidak ada berkas gambar wajah yang dikirim")

    images = _decode_images(await _read_all(uploads))
    if not images:
        raise HTTPException(status_code=400, detail="Format gambar tidak valid atau tidak dapat didekode")

    try:
        system, _ = get_engine()
        facenet = system.facenet
        embedding, n_frames = await run_in_threadpool(facenet.build_template, images, actual_id)
        if embedding is None:
            msg = f"Embedding tidak cukup ({n_frames}/5)"
            return EnrollmentResponse(success=False, message=msg, error=msg)

        clean_id, prefixed_id = _alias_keys(actual_id)
        res = await run_in_threadpool(
            facenet.persist_template, actual_id, name or actual_id, dept or "",
            embedding, n_frames, session_tag or "enrollment", (clean_id, prefixed_id),
        )
        return EnrollmentResponse(
            success=True,
            message=f"Wajah berhasil didaftarkan untuk ID {actual_id}",
            embedding_id=prefixed_id,
            subject_id=actual_id,
            template_hash=res.get("template_hash"),
            n_frames=res.get("n_frames"),
            backup=res.get("backup"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses enrollment: {str(e)}")


@router.post("/enroll/preview")
async def enroll_preview(
    request: Request,
    subject_id: Optional[str] = Form(None),
    teacher_id: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    name: Optional[str] = Form(""),
    dept: Optional[str] = Form(""),
    session_tag: Optional[str] = Form("web_enrollment"),
    mode: Optional[str] = Form("replace"),
):
    """
    Hitung template dari files[] tanpa menyentuh galeri. Template ditahan di memori
    dengan preview_token dan baru disimpan lewat /enroll/commit.

    mode="append" menambah sesi baru ke template yang ada alih-alih menggantinya.
    """
    mode = (mode or "replace").strip().lower()
    if mode not in ("replace", "append"):
        return _fail(400, "mode harus 'replace' atau 'append'", "BAD_MODE")
    form = await request.form()
    actual_id = _form_subject_id(form, subject_id, teacher_id, user_id)
    if not actual_id:
        return _fail(400, "subject_id / teacher_id / user_id diperlukan", "SUBJECT_ID_REQUIRED")

    uploads = _uploads(form)
    n_uploaded = len(uploads)
    if n_uploaded == 0:
        return _fail(400, "Tidak ada berkas gambar wajah yang dikirim", "NO_FILES", n_uploaded=0)
    if n_uploaded > MAX_ENROLL_FILES:
        return _fail(400, f"Maksimal {MAX_ENROLL_FILES} gambar per pratinjau, diterima {n_uploaded}",
                     "TOO_MANY_FILES", n_uploaded=n_uploaded)

    images = _decode_images(await _read_all(uploads))
    try:
        system, _ = get_engine()
    except Exception as e:
        return _fail(503, f"Mesin biometrik tidak dapat dimuat: {e}", "ENGINE_UNAVAILABLE",
                     n_uploaded=n_uploaded)
    facenet = system.facenet

    try:
        embedding, n_frames = await run_in_threadpool(facenet.build_template, images, actual_id)
        if embedding is None or n_frames < MIN_ENROLL_FRAMES:
            return JSONResponse(content={
                "success": False,
                "message": (f"Wajah terdeteksi pada {n_frames} dari {n_uploaded} gambar; "
                            f"minimal {MIN_ENROLL_FRAMES}. Template tidak diubah."),
                "error": "INSUFFICIENT_FACES",
                "n_frames": n_frames,
                "n_uploaded": n_uploaded,
            })
        current = await run_in_threadpool(facenet.current_embedding, actual_id)
    except Exception as e:
        return _fail(500, f"Gagal memproses pratinjau: {e}", "PREVIEW_FAILED",
                     n_uploaded=n_uploaded)

    # Jarak hanya dilaporkan bila benar-benar terukur terhadap template tersimpan.
    distance = None
    if current is not None and np.shape(current) == np.shape(embedding):
        distance = float(np.linalg.norm(embedding - current))

    if mode == "append":
        if distance is None:
            return _fail(422, "Belum ada template untuk subjek ini; gunakan mode ganti untuk pendaftaran pertama.",
                         "NO_TEMPLATE_TO_APPEND", n_frames=n_frames, n_uploaded=n_uploaded)
        if distance > APPEND_MAX_DISTANCE:
            return _fail(422, (f"Sampel baru berjarak {distance:.3f} dari template tersimpan (batas "
                               f"{APPEND_MAX_DISTANCE:.2f}); tidak digabung karena mungkin bukan wajah "
                               "yang sama. Gunakan mode ganti bila memang ingin mengganti template."),
                         "APPEND_TOO_FAR", n_frames=n_frames, n_uploaded=n_uploaded,
                         distance_to_current=distance)

    template_hash = facenet.template_hash(embedding)
    token = _stage({
        "subject_id": actual_id,
        "name": name or actual_id,
        "dept": dept or "",
        "session_tag": session_tag or "web_enrollment",
        "embedding": embedding,
        "n_frames": n_frames,
        "n_uploaded": n_uploaded,
        "template_hash": template_hash,
        "mode": mode,
    })
    return {
        "success": True,
        "message": f"Pratinjau template {actual_id} siap; simpan lewat /enroll/commit.",
        "preview_token": token,
        "subject_id": actual_id,
        "embedding_id": _alias_keys(actual_id)[1],
        "template_hash": template_hash,
        "n_frames": n_frames,
        "n_uploaded": n_uploaded,
        "distance_to_current": distance,
        "mode": mode,
    }


@router.post("/enroll/commit")
async def enroll_commit(request: Request):
    """
    Simpan template hasil /enroll/preview ke galeri (dengan cadangan galeri lama)
    di bawah subject_id, ID bersih, dan bentuk emb_.
    """
    body = await _read_body(request)
    token = str(body.get("preview_token") or "").strip()
    raw_subject = body.get("subject_id") or body.get("teacher_id") or body.get("user_id")
    subject = "" if raw_subject is None else str(raw_subject)
    if not token or not subject:
        return _fail(400, "preview_token dan subject_id diperlukan", "FIELDS_REQUIRED")

    with _previews_lock:
        _purge_expired(_clock())
        entry = _previews.get(token)
        if entry is None:
            return _fail(404, "Pratinjau tidak ditemukan atau sudah kedaluwarsa. Ulangi pratinjau.",
                         "PREVIEW_NOT_FOUND")
        if entry["subject_id"] != subject:
            return _fail(409, f"Pratinjau ini milik {entry['subject_id']}, bukan {subject}.",
                         "SUBJECT_MISMATCH")
        # Diambil sebelum menulis agar commit ganda dengan token sama hanya menulis sekali.
        del _previews[token]

    actual_id = entry["subject_id"]
    clean_id, prefixed_id = _alias_keys(actual_id)
    try:
        system, _ = get_engine()
        res = await run_in_threadpool(
            system.facenet.persist_template, actual_id, entry["name"], entry["dept"],
            entry["embedding"], entry["n_frames"], entry["session_tag"], (clean_id, prefixed_id),
            entry.get("mode") == "append",
        )
    except Exception as e:
        with _previews_lock:
            _previews.setdefault(token, entry)
        return _fail(500, f"Gagal menyimpan template: {e}", "COMMIT_FAILED")

    return {
        "success": True,
        "message": f"Wajah berhasil didaftarkan untuk ID {actual_id}",
        "embedding_id": prefixed_id,
        "subject_id": actual_id,
        "template_hash": res.get("template_hash"),
        "n_frames": res.get("n_frames"),
        "n_sessions": res.get("n_sessions"),
        "mode": entry.get("mode", "replace"),
        "backup": res.get("backup"),
    }


# Tag sesi yang direkam lewat kamera presensi (web/kiosk); selain itu template
# berasal dari foto (mis. dataset foto_selfie) dan biasanya tidak cocok dengan webcam.
WEBCAM_SESSION_TAGS = ("web_enrollment", "kiosk_webcam", "manual_enrollment")
PHOTO_SESSION_TAGS = ("enrollment", "enrollment_multisession")
MAX_STATUS_IDS = 100


def _session_source(tag: Any) -> str:
    tag = str(tag or "")
    if tag in WEBCAM_SESSION_TAGS or tag.startswith("preview_"):
        return "webcam"
    if tag in PHOTO_SESSION_TAGS:
        return "photo"
    return "unknown"


def _template_status(facenet: Any, subject_id: str) -> Dict[str, Any]:
    key = facenet.resolve_id(subject_id)
    if key is None:
        return {"id": subject_id, "enrolled": False, "key": None, "source": None,
                "n_sessions": 0, "webcam_sessions": 0, "n_frames": None, "enrolled_at": None}
    record = facenet.gallery[key]
    sessions = record.get("sessions") or [{"session": record.get("session")}]
    sources = [_session_source(s.get("session")) for s in sessions]
    webcam = sources.count("webcam")
    source = "webcam" if webcam else ("photo" if "photo" in sources else "unknown")
    return {
        "id": subject_id,
        "enrolled": True,
        "key": key,
        "source": source,
        "n_sessions": len(sessions),
        "webcam_sessions": webcam,
        "n_frames": record.get("n_frames"),
        "enrolled_at": record.get("enrolled_at"),
    }


@router.get("/gallery/status")
async def gallery_status(ids: str = ""):
    """
    Kesiapan template wajah per subjek (tanpa embedding): terdaftar atau belum,
    asal template (webcam/foto), dan jumlah sesi. Hanya membaca galeri.
    """
    wanted = [i.strip() for i in ids.split(",") if i.strip()]
    if not wanted:
        return _fail(400, "Parameter ids diperlukan, mis. ids=S01,S02", "IDS_REQUIRED")
    if len(wanted) > MAX_STATUS_IDS:
        return _fail(400, f"Maksimal {MAX_STATUS_IDS} ID", "TOO_MANY_IDS")
    try:
        system, _ = get_engine()
    except Exception as e:
        return _fail(503, f"Mesin biometrik tidak dapat dimuat: {e}", "ENGINE_UNAVAILABLE")
    facenet = system.facenet
    await run_in_threadpool(facenet.refresh_gallery)
    return {"success": True, "subjects": [_template_status(facenet, i) for i in wanted]}
