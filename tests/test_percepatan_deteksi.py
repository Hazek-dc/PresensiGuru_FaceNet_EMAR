"""
Percepatan /verify tanpa mengubah angka: FaceNet memakai hasil deteksi MTCNN
yang sudah ada, bukan mendeteksi ulang lewat mtcnn(img). Potongan wajah yang
masuk InceptionResnetV1 harus sama persis dengan MTCNN.forward.
"""

import glob
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="module")
def fes():
    pytest.importorskip("torch")
    import facenet_emar_system
    return facenet_emar_system


@pytest.fixture(scope="module")
def photo():
    cv2 = pytest.importorskip("cv2")
    photos = sorted(glob.glob(str(ROOT / "dataset" / "foto_selfie" / "*Reynaldi*")))
    if not photos:
        pytest.skip("foto contoh tidak ada")
    return cv2.imread(photos[0], cv2.IMREAD_REDUCED_COLOR_4)  # foto asli ~60 MB setelah didekode


def _frame_1080p(photo, face_scale):
    """Foto ditaruh di kanvas 1920x1080 seperti frame webcam Studio."""
    import cv2
    h, w = photo.shape[:2]
    s = 1080 * face_scale / h
    img = cv2.resize(photo, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    canvas = np.full((1080, 1920, 3), 90, np.uint8)
    y, x = (1080 - img.shape[0]) // 2, (1920 - img.shape[1]) // 2
    canvas[y:y + img.shape[0], x:x + img.shape[1]] = img
    return canvas


class _RecordingResnet:
    def __init__(self):
        self.inputs = []

    def __call__(self, t):
        import torch
        self.inputs.append(t.clone())
        return torch.ones((1, 512))


def test_embedding_memakai_potongan_wajah_yang_sama_dengan_mtcnn_forward(fes, photo):
    """Dulu: detect() lalu mtcnn(img) yang mendeteksi ulang. Potongan wajahnya harus identik."""
    import cv2
    fn = fes.FaceNetModule.__new__(fes.FaceNetModule)
    fn.device = fes.torch.device("cpu")
    fn._init_mtcnn()
    fn.resnet = _RecordingResnet()

    for frame in (photo, _frame_1080p(photo, 0.9)):
        assert fn._extract_embedding(frame) is not None
        expected = fn.mtcnn(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        assert fn.resnet.inputs[-1].shape == (1, 3, 160, 160)
        assert fes.torch.equal(fn.resnet.inputs[-1][0], expected)

    assert fn._extract_embedding(np.full((1080, 1920, 3), 90, np.uint8)) is None
