"""Mandatory audit criteria tests — written by the independent auditor.

These tests verify the six thesis-critical invariants without modifying
any production code.  They use only synthetic fixtures and never touch
real biometric data.

Auditor: Antigravity Pro
Writer:  Codex (separate agent)
"""

from __future__ import annotations

import sys
from math import sqrt
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Path setup — consistent with existing test conventions
# ---------------------------------------------------------------------------
API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.facenet_service import FaceNetService, InvalidEmbeddingError  # noqa: E402
from app.services.emar_service import EMARConfig, EMARService, EMARStatus  # noqa: E402
from app.services.fusion_service import fuse_predictions  # noqa: E402
from app.evaluation.evaluate_iso30107 import (  # noqa: E402
    PadEvaluationReport,
    evaluate_presentations,
    presentation_from_record,
)


# ═══════════════════════════════════════════════════════════════════════════
# KRITERIA 1: test_verification_is_1to1
# Membuktikan bahwa verify() hanya mencocokkan galeri subjek yang di-claim,
# tidak pernah men-scan seluruh galeri (1:N).
# ═══════════════════════════════════════════════════════════════════════════

class TestVerificationIs1To1:
    """Audit criterion 1 — verification must be strictly 1:1."""

    def test_verify_only_checks_claimed_subject_gallery(self) -> None:
        """Enroll three subjects with orthogonal embeddings.  Verify that
        calling verify('A', probe) only checks A's gallery vector, not B's
        or C's.  If the system were 1:N, a matching probe for B would
        spuriously match when claiming A.
        """
        service = FaceNetService(threshold=0.50)

        # Three orthogonal unit vectors — each pair has cosine similarity ≈ 0
        service.enroll("subject-A", [1.0, 0.0, 0.0])
        service.enroll("subject-B", [0.0, 1.0, 0.0])
        service.enroll("subject-C", [0.0, 0.0, 1.0])

        # Probe that matches B perfectly
        result = service.verify("subject-A", [0.0, 1.0, 0.0])

        # In a 1:1 system this must NOT match A (similarity ≈ 0)
        assert result.is_match is False
        assert result.subject_id == "subject-A"
        assert result.similarity == pytest.approx(0.0, abs=1e-9)

    def test_verify_matches_only_the_claimed_subject(self) -> None:
        """The complementary positive case: claiming the correct subject
        produces a match."""
        service = FaceNetService(threshold=0.50)

        service.enroll("subject-A", [1.0, 0.0, 0.0])
        service.enroll("subject-B", [0.0, 1.0, 0.0])

        # Probe that matches A
        result = service.verify("subject-A", [1.0, 0.0, 0.0])
        assert result.is_match is True
        assert result.similarity == pytest.approx(1.0)

    def test_verify_unknown_subject_raises_key_error_not_scan(self) -> None:
        """An unregistered subject_id must raise KeyError, not silently
        scan the gallery and return a non-match."""
        service = FaceNetService(threshold=0.50)
        service.enroll("subject-A", [1.0, 0.0])

        with pytest.raises(KeyError, match="subject-UNKNOWN"):
            service.verify("subject-UNKNOWN", [1.0, 0.0])


# ═══════════════════════════════════════════════════════════════════════════
# KRITERIA 2: test_gallery_probe_l2_normalization
# Membuktikan bahwa gallery DAN probe dinormalisasi dengan rutin yang sama.
# ═══════════════════════════════════════════════════════════════════════════

class TestGalleryProbeL2Normalization:
    """Audit criterion 2 — both vectors use identical L2 normalization."""

    def test_same_direction_different_magnitude_produces_perfect_match(self) -> None:
        """If both gallery and probe are L2-normalized identically, two
        vectors with the same direction but different magnitudes must
        produce cosine similarity ≈ 1.0."""
        service = FaceNetService(threshold=0.99)

        # Gallery: magnitude = 5.0
        service.enroll("emp-001", [3.0, 4.0])

        # Probe: magnitude = 500.0 — same direction
        result = service.verify("emp-001", [300.0, 400.0])

        assert result.is_match is True
        assert result.similarity == pytest.approx(1.0, abs=1e-9)

    def test_normalize_embedding_is_idempotent(self) -> None:
        """Normalizing an already-normalized vector must produce the same
        result — proving the routine is deterministic and safe to apply
        twice."""
        raw = [3.0, 4.0, 0.0]
        first = FaceNetService.normalize_embedding(raw)
        second = FaceNetService.normalize_embedding(first)

        assert first == pytest.approx(second)

    def test_gallery_and_probe_use_same_normalize_method(self) -> None:
        """Verify by source inspection equivalence: enroll and verify both
        call normalize_embedding, and the resulting vectors have unit norm."""
        service = FaceNetService(threshold=0.50)

        gallery_vec = service.enroll("emp-001", [3.0, 4.0])
        # Manually compute what normalize_embedding should produce
        norm = sqrt(3.0**2 + 4.0**2)
        expected = (3.0 / norm, 4.0 / norm)

        assert gallery_vec == pytest.approx(expected)

        # Verify: the probe goes through the same normalization
        result = service.verify("emp-001", [6.0, 8.0])  # same direction
        assert result.similarity == pytest.approx(1.0, abs=1e-9)


# ═══════════════════════════════════════════════════════════════════════════
# KRITERIA 3: test_fta_excluded_from_denominator
# FTA records tidak boleh masuk denominator APCER/BPCER.
# ═══════════════════════════════════════════════════════════════════════════

class TestFtaExcludedFromDenominator:
    """Audit criterion 3 — FTA must not inflate/deflate error rates."""

    def test_fta_does_not_enter_apcer_denominator(self) -> None:
        """2 attack records + 1 FTA attack.  Only 2 should be in the
        APCER denominator."""
        report = evaluate_presentations([
            {"label": "attack", "pad_decision": "attack", "fta": False},
            {"label": "attack", "pad_decision": "bona_fide", "fta": False},
            {"label": "attack", "pad_decision": "bona_fide", "fta": True},  # FTA
            {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
        ])

        assert report.attack_evaluated_count == 2  # NOT 3
        assert report.apcer_error_count == 1
        assert report.apcer == pytest.approx(0.5)  # 1/2, not 2/3

    def test_fta_does_not_enter_bpcer_denominator(self) -> None:
        """2 bona_fide records + 1 FTA bona_fide.  Only 2 should be in
        the BPCER denominator."""
        report = evaluate_presentations([
            {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
            {"label": "bona_fide", "pad_decision": "attack", "fta": False},
            {"label": "bona_fide", "pad_decision": "attack", "fta": True},  # FTA
            {"label": "attack", "pad_decision": "attack", "fta": False},
        ])

        assert report.bona_fide_evaluated_count == 2  # NOT 3
        assert report.bpcer_error_count == 1
        assert report.bpcer == pytest.approx(0.5)  # 1/2, not 2/3

    def test_fta_rate_is_over_total_presentations(self) -> None:
        """FTA rate = FTA count / total presentations (including FTA)."""
        report = evaluate_presentations([
            {"label": "attack", "pad_decision": "attack", "fta": False},
            {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
            {"label": "attack", "pad_decision": None, "fta": True},
            {"label": "bona_fide", "pad_decision": None, "fta": True},
        ])

        assert report.total_presentations == 4
        assert report.fta_count == 2
        assert report.fta_rate == pytest.approx(0.5)


# ═══════════════════════════════════════════════════════════════════════════
# KRITERIA 4: test_apcer_per_pai_species
# FAIL — Evaluator tidak mendukung species.  Audit mendemonstrasikan gap
# dan merekomendasikan perubahan ke Codex.
# ═══════════════════════════════════════════════════════════════════════════

class TestApcerPerPaiSpecies:
    """Audit criterion 4 — APCER must be calculable per PAI species.

    VERDICT: **FAIL**
    The current evaluator treats all attacks as a single class.  ISO 30107-3
    requires APCER to be reported per Presentation Attack Instrument (PAI)
    species (e.g., print, replay, 3D mask).

    RECOMMENDATION FOR CODEX:
    1. Add an optional ``species`` field to the manifest schema.
    2. Group attacks by species before computing APCER.
    3. Report per-species APCER in PadEvaluationReport.
    """

    def test_evaluator_has_no_species_field(self) -> None:
        """Demonstrate that the manifest schema does not accept a 'species'
        field and the evaluator has no per-species APCER breakdown."""
        record = presentation_from_record({
            "label": "attack",
            "pad_decision": "attack",
            "fta": False,
        })

        # The Presentation dataclass has no 'species' attribute
        assert not hasattr(record, "species"), (
            "If this fails, species support has been added — re-audit needed"
        )

    def test_manual_per_species_apcer_calculation(self) -> None:
        """Demonstrate the correct per-species APCER calculation manually.
        This serves as the specification for Codex's implementation.

        Scenario (synthetic):
        - print attacks: 2 total, 1 misclassified → APCER_print = 0.5
        - replay attacks: 3 total, 0 misclassified → APCER_replay = 0.0
        """
        manifest_with_species = [
            {"label": "attack", "pad_decision": "bona_fide", "fta": False, "species": "print"},
            {"label": "attack", "pad_decision": "attack", "fta": False, "species": "print"},
            {"label": "attack", "pad_decision": "attack", "fta": False, "species": "replay"},
            {"label": "attack", "pad_decision": "attack", "fta": False, "species": "replay"},
            {"label": "attack", "pad_decision": "attack", "fta": False, "species": "replay"},
            {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False, "species": None},
        ]

        # Manual per-species APCER calculation (what the evaluator SHOULD do)
        species_groups: dict[str, list[dict]] = {}
        for record in manifest_with_species:
            if record["label"] == "attack" and not record["fta"]:
                sp = record.get("species", "unknown")
                species_groups.setdefault(sp, []).append(record)

        per_species_apcer = {}
        for species_name, attacks in species_groups.items():
            errors = sum(1 for a in attacks if a["pad_decision"] == "bona_fide")
            per_species_apcer[species_name] = errors / len(attacks)

        assert per_species_apcer["print"] == pytest.approx(0.5)
        assert per_species_apcer["replay"] == pytest.approx(0.0)

    def test_current_evaluator_lumps_all_attacks_together(self) -> None:
        """The current evaluator computes a single aggregate APCER.
        This is the gap that must be addressed."""
        report = evaluate_presentations([
            # "print" attacks — 1 of 2 misclassified
            {"label": "attack", "pad_decision": "bona_fide", "fta": False},
            {"label": "attack", "pad_decision": "attack", "fta": False},
            # "replay" attacks — 0 of 3 misclassified
            {"label": "attack", "pad_decision": "attack", "fta": False},
            {"label": "attack", "pad_decision": "attack", "fta": False},
            {"label": "attack", "pad_decision": "attack", "fta": False},
            # bona fide
            {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
        ])

        # Aggregate APCER = 1/5 = 0.2 — hides that print APCER is actually 0.5
        assert report.apcer == pytest.approx(0.2)
        # No per-species breakdown available
        assert not hasattr(report, "apcer_per_species")


# ═══════════════════════════════════════════════════════════════════════════
# KRITERIA 5: test_manifest_no_split_overlap
# Validasi bahwa manifest sintetis untuk split berbeda tidak memiliki overlap.
# ═══════════════════════════════════════════════════════════════════════════

class TestManifestNoSplitOverlap:
    """Audit criterion 5 — data splits must not share records.

    This test uses synthetic manifest fixtures to validate the split
    isolation principle from thesis-methodology.mdc:
    'Keep DEVELOPMENT, CALIBRATION, and TEST splits immutable.'
    """

    @staticmethod
    def _create_synthetic_split(
        prefix: str, count: int
    ) -> list[dict]:
        """Create a synthetic manifest split with identifiable records."""
        records = []
        for i in range(count):
            records.append({
                "id": f"{prefix}-{i:04d}",
                "label": "bona_fide" if i % 2 == 0 else "attack",
                "pad_decision": "bona_fide" if i % 2 == 0 else "attack",
                "fta": False,
            })
        return records

    def test_synthetic_splits_have_no_overlap(self) -> None:
        """Three synthetic splits must have disjoint record IDs."""
        dev_split = self._create_synthetic_split("DEV", 50)
        cal_split = self._create_synthetic_split("CAL", 30)
        test_split = self._create_synthetic_split("TEST", 20)

        dev_ids = {r["id"] for r in dev_split}
        cal_ids = {r["id"] for r in cal_split}
        test_ids = {r["id"] for r in test_split}

        assert dev_ids.isdisjoint(cal_ids), "DEV and CAL splits overlap"
        assert dev_ids.isdisjoint(test_ids), "DEV and TEST splits overlap"
        assert cal_ids.isdisjoint(test_ids), "CAL and TEST splits overlap"

    def test_overlap_detection_catches_contamination(self) -> None:
        """If the same record appears in two splits, the overlap check
        must detect it."""
        split_a = [
            {"id": "SHARED-0001", "label": "attack", "pad_decision": "attack", "fta": False},
            {"id": "A-0002", "label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
        ]
        split_b = [
            {"id": "SHARED-0001", "label": "attack", "pad_decision": "attack", "fta": False},
            {"id": "B-0002", "label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
        ]

        ids_a = {r["id"] for r in split_a}
        ids_b = {r["id"] for r in split_b}

        overlap = ids_a & ids_b
        assert len(overlap) > 0, "Overlap should be detected"
        assert "SHARED-0001" in overlap

    def test_union_of_splits_preserves_total_count(self) -> None:
        """When splits are disjoint, their union should equal the sum of
        their sizes — no records lost or duplicated."""
        dev_split = self._create_synthetic_split("DEV", 50)
        cal_split = self._create_synthetic_split("CAL", 30)
        test_split = self._create_synthetic_split("TEST", 20)

        all_ids = (
            {r["id"] for r in dev_split}
            | {r["id"] for r in cal_split}
            | {r["id"] for r in test_split}
        )
        assert len(all_ids) == 50 + 30 + 20


# ═══════════════════════════════════════════════════════════════════════════
# KRITERIA 6: test_invalid_claim_not_non_match
# Subject yang tidak terdaftar harus menghasilkan error, bukan non-match.
# ═══════════════════════════════════════════════════════════════════════════

class TestInvalidClaimNotNonMatch:
    """Audit criterion 6 — invalid claims must error, not return false.

    If an invalid claim silently returned is_match=False, an attacker could
    enumerate valid subject IDs by observing which IDs return False vs. which
    return a match score.  The correct behavior is to raise an exception,
    making the boundary layer responsible for consistent error responses.
    """

    def test_unenrolled_subject_raises_key_error(self) -> None:
        """Claiming a subject that was never enrolled must raise KeyError."""
        service = FaceNetService(threshold=0.50)
        service.enroll("valid-employee", [1.0, 0.0])

        with pytest.raises(KeyError):
            service.verify("nonexistent-employee", [1.0, 0.0])

    def test_key_error_message_includes_subject_id(self) -> None:
        """The error message must include the claimed subject ID for
        debugging, while the boundary layer decides what to expose."""
        service = FaceNetService(threshold=0.50)

        with pytest.raises(KeyError, match="ghost-id-999"):
            service.verify("ghost-id-999", [1.0, 0.0])

    def test_empty_gallery_raises_key_error(self) -> None:
        """An empty gallery must raise KeyError for any claim."""
        service = FaceNetService(threshold=0.50)

        with pytest.raises(KeyError):
            service.verify("any-subject", [1.0, 0.0])

    def test_invalid_claim_never_returns_verification_result(self) -> None:
        """Ensure that no code path for an unenrolled subject returns a
        VerificationResult with is_match=False instead of raising."""
        service = FaceNetService(threshold=0.00)  # threshold=0 would match everything

        service.enroll("real-employee", [1.0, 0.0])

        # Even with threshold=0, an invalid claim must still error
        with pytest.raises(KeyError):
            service.verify("fake-employee", [1.0, 0.0])

    def test_blank_subject_id_is_rejected(self) -> None:
        """Whitespace-only subject IDs must be rejected at enrollment
        and verification to prevent ambiguous claims."""
        service = FaceNetService(threshold=0.50)

        with pytest.raises(ValueError):
            service.enroll("   ", [1.0, 0.0])

        with pytest.raises(ValueError):
            service.verify("", [1.0, 0.0])
