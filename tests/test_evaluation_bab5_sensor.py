"""
Penulis kedua Dataset_Eksperimen_Bab5.csv (evaluation_bab5.py, dipakai
live_inference_pad.py) tidak boleh mencatat 30 cm / 300 lux yang tidak diukur,
dan --demo tidak boleh menulis baris simulasi ke dataset riset.
"""

import csv
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import evaluation_bab5 as eb


def _sidecar(path, key, value, source="luxmeter_serial", age_s=0.0):
    t = (datetime.now().astimezone() - timedelta(seconds=age_s)).isoformat()
    path.write_text(json.dumps({key: value, "source": source, "updated_at": t}), encoding="utf-8")


@pytest.fixture
def sidecars(tmp_path, monkeypatch):
    lux, dist = tmp_path / "lux.json", tmp_path / "dist.json"
    monkeypatch.setattr(eb, "LUX_FILE", lux)
    monkeypatch.setattr(eb, "DISTANCE_FILE", dist)
    return lux, dist


def test_tanpa_bacaan_tidak_ada_nilai_karangan(sidecars):
    assert eb.read_live_environment_sensors() == (None, None)


def test_bacaan_segar_dipakai(sidecars):
    lux, dist = sidecars
    _sidecar(lux, "lux", 212.5)
    _sidecar(dist, "distance_cm", 44.0, source="distance_sensor")
    assert eb.read_live_environment_sensors() == (44.0, 212.5)


@pytest.mark.parametrize("source,age", [("research_preset", 0), ("default", 0), ("luxmeter_serial", 30)])
def test_preset_atau_basi_ditolak(sidecars, source, age):
    lux, dist = sidecars
    _sidecar(lux, "lux", 300, source=source, age_s=age)
    _sidecar(dist, "distance_cm", 30, source=source, age_s=age)
    assert eb.read_live_environment_sensors() == (None, None)


def test_nilai_kosong_ditulis_sebagai_sel_kosong(sidecars, tmp_path):
    out = tmp_path / "bab5.csv"
    eb.evaluate_and_log("S01", None, None, "Bona_Fide", 0.3, 0.15, 0.2, filename=str(out))
    rows = list(csv.reader(out.open(encoding="utf-8")))
    header, row = rows[0], rows[1]
    assert row[header.index("jarak_cm")] == ""
    assert row[header.index("lux")] == ""


def test_demo_menolak_csv_riset(monkeypatch, tmp_path):
    research = Path(eb.BASE_DIR) / eb.DEFAULT_CSV_PATH
    before = research.read_bytes() if research.exists() else None
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["evaluation_bab5.py", "--demo"])
    with pytest.raises(SystemExit) as e:
        eb.main()
    assert e.value.code == 2
    assert not (tmp_path / eb.DEFAULT_CSV_PATH).exists()
    assert (research.read_bytes() if research.exists() else None) == before


def test_demo_ke_berkas_lain_tetap_jalan(monkeypatch, tmp_path):
    out = tmp_path / "demo.csv"
    monkeypatch.setattr(sys, "argv", ["evaluation_bab5.py", "--demo", "--csv", str(out)])
    eb.main()
    assert len(list(csv.reader(out.open(encoding="utf-8")))) == 5   # header + P01-P04
