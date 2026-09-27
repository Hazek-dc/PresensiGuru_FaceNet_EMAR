"""
Skrip pendaftaran galeri tidak boleh menimpa subjek lain atau memakai data
sesi uji. Hanya tabel alias dan pemilihan berkas yang diuji; skrip tidak dijalankan.
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))


@pytest.fixture
def auto_enroll():
    pytest.importorskip("torch")
    import auto_enroll_gallery
    return auto_enroll_gallery


@pytest.fixture
def enroll_qalwani():
    pytest.importorskip("torch")
    import enroll_qalwani
    return enroll_qalwani


def test_alias_nur_holis_tidak_memetakan_qalwani001(auto_enroll):
    name, ids = auto_enroll.map_filename_to_subject_ids("17805338724046890026856170677286 - nur holis.jpg")
    assert name == "nur holis"
    assert "QALWANI001" not in ids
    assert {"NURHOLIS", "S01", "V1", "V2", "V3"} <= set(ids)


@pytest.mark.parametrize("filename", [
    "1 - nur holis.jpg", "1 - Viky Widiyanti.jpg", "1 - Mauludin Mauludin.jpg",
    "1 - Merli Yanti.jpg", "1 - Karmila Milla.jpg", "1 - Reynaldi surya.S.jpg",
    "1 - Taufik Hidayat.jpg", "1 - Wery Saputra.jpg", "1 - Susi Lisnasari.jpg",
    "1 - Ponco Prasetio.jpg", "1 - Yulisma Shinta.jpg", "1 - Arie Lazido.jpg",
])
def test_tidak_ada_foto_yang_dipetakan_ke_qalwani001(auto_enroll, filename):
    assert "QALWANI001" not in auto_enroll.map_filename_to_subject_ids(filename)[1]


def test_enroll_qalwani_hanya_memakai_session_e(enroll_qalwani):
    expected = ROOT / "dataset" / "self_qalwani" / "raw" / "enrollment" / "session_e"
    assert enroll_qalwani.ENROLLMENT_DIR == expected
    assert enroll_qalwani.SESSION_TAG == "session_e"


def test_enroll_qalwani_mengabaikan_sesi_lain(enroll_qalwani, tmp_path):
    root = tmp_path / "self_qalwani"
    session_e = root / "raw" / "enrollment" / "session_e"
    for rel in ("qal1.jpg", "20260708_155053.mp4",
                "raw/calibration/session_c/bona_fide/c.jpg",
                "raw/test/session_t/attacks/t.mp4",
                "raw/enrollment/session_e/e1.jpg", "raw/enrollment/session_e/sub/e2.PNG",
                "raw/enrollment/session_e/e.mp4", "raw/enrollment/session_e/.gitkeep"):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_bytes(b"x")

    images, videos = enroll_qalwani.enrollment_media(session_e)
    assert [p.relative_to(session_e).as_posix() for p in images] == ["e1.jpg", "sub/e2.PNG"]
    assert [p.relative_to(session_e).as_posix() for p in videos] == ["e.mp4"]


def test_enroll_qalwani_tidak_membuat_template_acak():
    source = (ROOT / "scripts" / "enroll_qalwani.py").read_text(encoding="utf-8")
    assert "np.random" not in source
    assert "session_tag=SESSION_TAG" in source
