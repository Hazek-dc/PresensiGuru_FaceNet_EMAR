"""
Rasio lebar wajah dari gambar atau video, tanpa verifikasi identitas.

Dipakai kalibrasi jarak kamera: Laravel mengirim frame yang diambil pada 30, 45,
dan 60 cm, lalu menyimpan rasio mesin di samping rasio browser. Endpoint ini
tidak menyimpan apa pun dan tidak membaca atau menulis galeri wajah.
"""

import itertools
import logging
import os
import shutil
import tempfile
from typing import Any, Iterator, List, Optional

import numpy as np
from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile as StarletteUploadFile

from routers.attendance import get_engine
from routers.enrollment import _decode_images, _fail, _read_all

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_MEASURE_FILES = 30
# 10 detik pada 30 fps. Kalibrasi hanya butuh beberapa frame diam, dan tiap
# frame 1080p memakan ~200 ms deteksi dlib.
MAX_VIDEO_FRAMES = 300


def _video_frames(fes: Any, images: List[np.ndarray], video_path: Optional[str]) -> Iterator[np.ndarray]:
    yield from images
    if not video_path:
        return
    video = fes._iter_video_frames(video_path)
    try:
        yield from itertools.islice(video, MAX_VIDEO_FRAMES)
    finally:
        # Melepas VideoCapture; di Windows berkas sementara tidak bisa dihapus sebelumnya.
        video.close()


def _measure(fes: Any, emar: Any, images: List[np.ndarray], video_path: Optional[str]) -> dict:
    frames = _video_frames(fes, images, video_path)
    try:
        return fes.measure_face_width(emar, frames)
    finally:
        frames.close()


@router.post("/measure/face-width")
async def measure_face_width(request: Request):
    """
    Median rasio lebar wajah (lebar rahang dlib 0-16 / lebar frame) dari files[]
    (1-30 gambar) dan/atau satu video. face_width_ratio bernilai null bila wajah
    tidak terdeteksi pada frame mana pun.
    """
    form = await request.form()
    videos = [v for v in form.getlist("video") if isinstance(v, StarletteUploadFile)]
    uploads = [value for key in form.keys() if key != "video"
               for value in form.getlist(key) if isinstance(value, StarletteUploadFile)]

    if not uploads and not videos:
        return _fail(400, "Kirim files[] (gambar) atau video", "NO_FILES")
    if len(uploads) > MAX_MEASURE_FILES:
        return _fail(400, f"Maksimal {MAX_MEASURE_FILES} gambar, diterima {len(uploads)}",
                     "TOO_MANY_FILES")
    if len(videos) > 1:
        return _fail(400, "Maksimal satu video per permintaan", "TOO_MANY_VIDEOS")

    images = _decode_images(await _read_all(uploads))
    if not images and not videos:
        return _fail(400, "Gambar tidak dapat didekode", "NO_DECODABLE_FRAME")

    video_path = None
    try:
        if videos:
            suffix = os.path.splitext(videos[0].filename or "")[1] or ".webm"
            fd, video_path = tempfile.mkstemp(prefix="ukur_lebar_", suffix=suffix)
            # Disalin bertahap seperti /verify; membaca utuh ke memori bisa
            # menghabiskan RAM mesin yang sudah sempit.
            with os.fdopen(fd, "wb") as out:
                shutil.copyfileobj(videos[0].file, out)

        try:
            system, _ = get_engine()
            import facenet_emar_system as fes
        except Exception as e:
            return _fail(503, f"Mesin biometrik tidak dapat dimuat: {e}", "ENGINE_UNAVAILABLE")

        try:
            result = await run_in_threadpool(_measure, fes, system.emar, images, video_path)
        except ValueError as e:
            return _fail(400, str(e), "VIDEO_UNREADABLE")
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except OSError as e:
                logger.warning("Berkas video sementara tidak terhapus: %s (%s)", video_path, e)

    if result["n_frames"] == 0:
        return _fail(400, "Tidak ada gambar atau frame video yang dapat didekode",
                     "NO_DECODABLE_FRAME")

    n_face, n_frames = result["n_frames_with_face"], result["n_frames"]
    message = (f"Wajah terdeteksi pada {n_face} dari {n_frames} frame."
               if n_face else f"Wajah tidak terdeteksi pada {n_frames} frame yang dikirim.")
    return {"success": True, "message": message, **result}


@router.post("/measure/brightness")
async def measure_brightness(request: Request):
    """
    Median luma (Rec.601, 0-255) dari files[] (1-30 gambar) untuk kalibrasi dan
    pengukuran ulang lux. Tanpa model biometrik, tanpa galeri; tidak ada angka
    lux di sini karena konversinya memakai model kalibrasi luxmeter di Laravel.
    """
    form = await request.form()
    uploads = [value for key in form.keys()
               for value in form.getlist(key) if isinstance(value, StarletteUploadFile)]
    if not uploads:
        return _fail(400, "Kirim files[] (gambar)", "NO_FILES")
    if len(uploads) > MAX_MEASURE_FILES:
        return _fail(400, f"Maksimal {MAX_MEASURE_FILES} gambar, diterima {len(uploads)}",
                     "TOO_MANY_FILES")

    images = _decode_images(await _read_all(uploads))
    if not images:
        return _fail(400, "Gambar tidak dapat didekode", "NO_DECODABLE_FRAME")

    import facenet_emar_system as fes
    result = await run_in_threadpool(fes.measure_brightness, images)
    return {"success": True, "message": f"Kecerahan diukur dari {result['n_frames']} gambar.", **result}
