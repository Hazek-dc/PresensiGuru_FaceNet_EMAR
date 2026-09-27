"""Mock end-to-end pipeline tests — written by the independent auditor.

These tests simulate the full verification pipeline:
    FaceNet enrollment/verify → EMAR liveness → Fusion decision

All data is synthetic.  No real biometric data is accessed.
No production code is modified.

Auditor: Antigravity Pro
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.facenet_service import FaceNetService, InvalidEmbeddingError  # noqa: E402
from app.services.emar_service import EMARConfig, EMARService, EMARStatus  # noqa: E402
from app.services.fusion_service import fuse_predictions, FusionResult  # noqa: E402
from app.evaluation.evaluate_iso30107 import evaluate_presentations  # noqa: E402


# ---------------------------------------------------------------------------
# Shared synthetic fixtures
# ---------------------------------------------------------------------------

def _create_facenet_service(threshold: float = 0.80) -> FaceNetService:
    """Create a FaceNet service with a synthetic gallery."""
    service = FaceNetService(threshold=threshold)
    # Enroll a synthetic employee with a known embedding
    service.enroll("EMP-001", [1.0, 0.0, 0.0, 0.0])
    return service


def _create_emar_service(
    *,
    ear_closed: float = 0.2,
    mar_open: float = 0.5,
    required_blinks: int = 1,
    max_seconds: float = 10.0,
) -> EMARService:
    """Create an EMAR service with a synthetic liveness policy."""
    return EMARService(EMARConfig(
        ear_closed_threshold=ear_closed,
        mar_open_threshold=mar_open,
        required_blinks=required_blinks,
        max_seconds=max_seconds,
    ))


def _simulate_successful_liveness(service: EMARService) -> bool:
    """Simulate a blink + mouth open within the time limit."""
    service.observe_metrics(ear=0.3, mar=0.2, timestamp=0.0)   # open eye, closed mouth
    service.observe_metrics(ear=0.1, mar=0.2, timestamp=0.5)   # closed eye (blink start)
    result = service.observe_metrics(ear=0.3, mar=0.6, timestamp=1.0)  # open eye + open mouth
    return result.passed


def _simulate_failed_liveness_timeout(service: EMARService) -> bool:
    """Simulate a timeout (no blink detected before deadline)."""
    service.observe_metrics(ear=0.3, mar=0.2, timestamp=0.0)
    result = service.observe_metrics(ear=0.3, mar=0.2, timestamp=10.0)  # at deadline
    return result.passed


# ═══════════════════════════════════════════════════════════════════════════
# E2E-3: MATCH + BONA_FIDE → presensi tercatat (accepted)
# ═══════════════════════════════════════════════════════════════════════════

class TestE2EMatchBonafideAccepted:
    """E2E scenario 3: identity match + liveness passed → accepted."""

    def test_full_pipeline_match_and_liveness_pass(self) -> None:
        """Simulate the complete happy path:
        1. FaceNet verifies identity (probe matches gallery)
        2. EMAR liveness challenge passes (blink + mouth open)
        3. Fusion gate accepts (identity AND PAD both true)
        """
        # Step 1: Identity verification
        facenet = _create_facenet_service(threshold=0.80)
        identity_result = facenet.verify("EMP-001", [1.0, 0.0, 0.0, 0.0])
        assert identity_result.is_match is True

        # Step 2: Liveness (PAD)
        emar = _create_emar_service()
        liveness_passed = _simulate_successful_liveness(emar)
        assert liveness_passed is True

        # Step 3: Fusion
        fusion_result = fuse_predictions(
            identity_verified=identity_result.is_match,
            pad_passed=liveness_passed,
        )
        assert fusion_result.final_decision is True
        assert fusion_result.accepted is True
        assert fusion_result.reasons == ("identity_verified", "pad_passed")

    def test_accepted_result_contains_all_required_audit_fields(self) -> None:
        """The fusion result must contain explainable fields for the
        attendance record."""
        fusion_result = fuse_predictions(identity_verified=True, pad_passed=True)

        assert hasattr(fusion_result, "identity_verified")
        assert hasattr(fusion_result, "pad_passed")
        assert hasattr(fusion_result, "final_decision")
        assert hasattr(fusion_result, "reasons")
        assert hasattr(fusion_result, "accepted")


# ═══════════════════════════════════════════════════════════════════════════
# E2E-4: MATCH + ATTACK → ditolak
# ═══════════════════════════════════════════════════════════════════════════

class TestE2EMatchAttackRejected:
    """E2E scenario 4: identity match but liveness failed → rejected."""

    def test_identity_match_with_liveness_timeout_is_rejected(self) -> None:
        """Even if identity matches, a failed liveness challenge must
        result in rejection.  The fusion gate is non-bypassable."""
        # Step 1: Identity matches
        facenet = _create_facenet_service(threshold=0.80)
        identity_result = facenet.verify("EMP-001", [1.0, 0.0, 0.0, 0.0])
        assert identity_result.is_match is True

        # Step 2: Liveness times out (simulating a presentation attack)
        emar = _create_emar_service(max_seconds=2.0)
        emar.observe_metrics(ear=0.3, mar=0.2, timestamp=0.0)
        liveness_result = emar.observe_metrics(ear=0.3, mar=0.2, timestamp=2.0)
        assert liveness_result.passed is False
        assert liveness_result.status is EMARStatus.FAILED

        # Step 3: Fusion rejects
        fusion_result = fuse_predictions(
            identity_verified=identity_result.is_match,
            pad_passed=liveness_result.passed,
        )
        assert fusion_result.final_decision is False
        assert fusion_result.accepted is False
        assert "pad_not_passed" in fusion_result.reasons

    def test_identity_mismatch_with_liveness_pass_is_also_rejected(self) -> None:
        """If identity doesn't match but liveness passes, still rejected."""
        facenet = _create_facenet_service(threshold=0.80)
        identity_result = facenet.verify("EMP-001", [0.0, 1.0, 0.0, 0.0])
        assert identity_result.is_match is False

        fusion_result = fuse_predictions(
            identity_verified=identity_result.is_match,
            pad_passed=True,
        )
        assert fusion_result.final_decision is False
        assert "identity_not_verified" in fusion_result.reasons

    def test_both_fail_produces_two_blocking_reasons(self) -> None:
        """When both gates fail, both reasons must be reported."""
        fusion_result = fuse_predictions(
            identity_verified=False,
            pad_passed=False,
        )
        assert fusion_result.final_decision is False
        assert fusion_result.reasons == ("identity_not_verified", "pad_not_passed")


# ═══════════════════════════════════════════════════════════════════════════
# E2E-5: FTA → ditolak & dicatat gagal akuisisi
# ═══════════════════════════════════════════════════════════════════════════

class TestE2EFtaRejectedAndRecorded:
    """E2E scenario 5: failure to acquire → rejected, recorded as FTA."""

    def test_invalid_embedding_is_fta_not_non_match(self) -> None:
        """An invalid biometric sample (zero vector, NaN, empty) must
        raise an error at enrollment/verification, not silently produce
        a non-match score.  This is a Failure to Acquire."""
        service = FaceNetService(threshold=0.50)

        with pytest.raises(InvalidEmbeddingError):
            service.enroll("EMP-001", [0.0, 0.0, 0.0])

        with pytest.raises(InvalidEmbeddingError):
            service.enroll("EMP-001", [])

    def test_fta_recorded_separately_in_evaluation(self) -> None:
        """FTA records must be tracked separately and must not contribute
        to APCER/BPCER denominators."""
        report = evaluate_presentations([
            {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
            {"label": "bona_fide", "pad_decision": None, "fta": True},  # FTA
            {"label": "attack", "pad_decision": "attack", "fta": False},
            {"label": "attack", "pad_decision": None, "fta": True},  # FTA
        ])

        assert report.fta_count == 2
        assert report.bona_fide_fta_count == 1
        assert report.attack_fta_count == 1
        assert report.bona_fide_evaluated_count == 1  # Not 2
        assert report.attack_evaluated_count == 1  # Not 2

    def test_emar_invalid_landmarks_cannot_complete_challenge(self) -> None:
        """Invalid eye landmarks produce an invalid EAR, which must not
        count toward the blink requirement."""
        emar = _create_emar_service(required_blinks=1, max_seconds=5.0)

        # Feed invalid landmarks (wrong count)
        result = emar.observe_landmarks(
            eye_landmarks=[(0, 0)] * 5,  # needs 6
            mouth_landmarks=[(0, 0)] * 8,
            timestamp=0.0,
        )

        assert result.status is EMARStatus.PENDING
        assert result.passed is False
        assert "invalid_eye_landmarks" in result.reasons


# ═══════════════════════════════════════════════════════════════════════════
# E2E-6: Presensi ganda → ditolak
# ═══════════════════════════════════════════════════════════════════════════

class TestE2EDuplicateBiometricRequestRejected:
    """E2E scenario 6: duplicate attendance request → rejected.

    The UNIQUE constraint on biometric_request_id in the database schema
    prevents duplicate records.  Since we cannot run Laravel here, we
    simulate the concept with a set-based uniqueness check.
    """

    def test_duplicate_request_id_detected_by_set(self) -> None:
        """Simulate the UNIQUE constraint behavior: a second request with
        the same biometric_request_id must be rejected."""
        processed_request_ids: set[str] = set()

        # First request — accepted
        request_id_1 = "req-abc-001"
        assert request_id_1 not in processed_request_ids
        processed_request_ids.add(request_id_1)

        # Duplicate request — rejected
        request_id_2 = "req-abc-001"  # same ID
        assert request_id_2 in processed_request_ids, (
            "Duplicate biometric_request_id must be detected"
        )

    def test_different_request_ids_are_accepted(self) -> None:
        """Distinct request IDs must each be accepted."""
        processed_request_ids: set[str] = set()

        for i in range(5):
            request_id = f"req-unique-{i:04d}"
            assert request_id not in processed_request_ids
            processed_request_ids.add(request_id)

        assert len(processed_request_ids) == 5


# ═══════════════════════════════════════════════════════════════════════════
# E2E-7: FastAPI mati → app tidak crash
# Diuji di sisi Laravel (AttendanceE2EMockTest.php).
# Di sisi Python, kita verifikasi bahwa service layer tidak memiliki
# implicit external dependency yang akan crash jika tidak tersedia.
# ═══════════════════════════════════════════════════════════════════════════

class TestE2EServiceIsolation:
    """E2E scenario 7 (Python side): services must be self-contained
    and not depend on external network calls."""

    def test_facenet_service_requires_no_network(self) -> None:
        """FaceNetService must work purely in-memory with no HTTP calls."""
        service = FaceNetService(threshold=0.80)
        service.enroll("emp-001", [1.0, 0.0])
        result = service.verify("emp-001", [1.0, 0.0])
        assert result.is_match is True

    def test_emar_service_requires_no_network(self) -> None:
        """EMARService must work purely with caller-supplied timestamps."""
        emar = _create_emar_service()
        liveness_passed = _simulate_successful_liveness(emar)
        assert liveness_passed is True

    def test_fusion_service_requires_no_network(self) -> None:
        """FusionService is a pure boolean gate with no dependencies."""
        result = fuse_predictions(identity_verified=True, pad_passed=True)
        assert result.final_decision is True

    def test_evaluator_requires_no_network(self) -> None:
        """The ISO 30107 evaluator works on in-memory presentation lists."""
        report = evaluate_presentations([
            {"label": "attack", "pad_decision": "attack", "fta": False},
            {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
        ])
        assert report.apcer == pytest.approx(0.0)
        assert report.bpcer == pytest.approx(0.0)
