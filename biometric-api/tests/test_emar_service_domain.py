from __future__ import annotations

from pathlib import Path
import sys

import pytest


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.emar_service import (  # noqa: E402
    BlinkTracker,
    EMARConfig,
    EMARService,
    EMARStatus,
    LandmarkValidationError,
    compute_ear,
    compute_mar,
)


def test_emar_domain_computes_known_ear_and_mar_values() -> None:
    eye = [(0, 0), (1, 1), (2, 1), (4, 0), (2, -1), (1, -1)]
    mouth = [
        (0, 0),
        (1, 1),
        (2, 1),
        (3, 1),
        (4, 0),
        (3, -1),
        (2, -1),
        (1, -1),
    ]

    assert compute_ear(eye) == pytest.approx(0.5)
    assert compute_mar(mouth) == pytest.approx(0.75)


def test_emar_domain_rejects_malformed_landmarks_and_handles_degenerate_width() -> None:
    assert compute_ear([(0, 0)] * 6) is None

    with pytest.raises(LandmarkValidationError, match="exactly 8"):
        compute_mar([(0, 0)] * 7)


def test_emar_domain_counts_only_open_closed_open_blinks() -> None:
    tracker = BlinkTracker(ear_closed_threshold=0.2)

    tracker.observe(0.3)
    tracker.observe(0.1)
    tracker.observe(0.1)
    completed = tracker.observe(0.3)

    assert completed.blink_detected is True
    assert completed.blink_count == 1


def test_emar_domain_requires_caller_supplied_challenge_policy_and_passes_before_deadline() -> None:
    service = EMARService(
        EMARConfig(
            ear_closed_threshold=0.2,
            mar_open_threshold=0.5,
            required_blinks=1,
            max_seconds=10.0,
        )
    )

    service.observe_metrics(ear=0.3, mar=0.2, timestamp=0.0)
    service.observe_metrics(ear=0.1, mar=0.2, timestamp=1.0)
    result = service.observe_metrics(ear=0.3, mar=0.6, timestamp=2.0)

    assert result.status is EMARStatus.PASSED
    assert result.passed is True
    assert result.blink_count == 1
    assert result.mouth_open_seen is True


def test_emar_domain_fails_closed_when_the_caller_configured_deadline_is_reached() -> None:
    service = EMARService(
        EMARConfig(
            ear_closed_threshold=0.2,
            mar_open_threshold=None,
            required_blinks=1,
            max_seconds=2.0,
        )
    )

    service.observe_metrics(ear=0.3, mar=None, timestamp=0.0)
    result = service.observe_metrics(ear=0.1, mar=None, timestamp=2.0)
    later_result = service.observe_metrics(ear=0.3, mar=None, timestamp=2.1)

    assert result.status is EMARStatus.FAILED
    assert result.passed is False
    assert result.reasons == ("timeout",)
    assert later_result.status is EMARStatus.FAILED
    assert later_result.reasons == ("timeout",)


def test_emar_domain_invalid_landmarks_cannot_complete_the_challenge() -> None:
    service = EMARService(
        EMARConfig(
            ear_closed_threshold=0.2,
            mar_open_threshold=None,
            required_blinks=1,
            max_seconds=5.0,
        )
    )

    result = service.observe_landmarks(
        eye_landmarks=[(0, 0)] * 5,
        mouth_landmarks=[(0, 0)] * 8,
        timestamp=0.0,
    )

    assert result.status is EMARStatus.PENDING
    assert result.passed is False
    assert "invalid_eye_landmarks" in result.reasons
    assert "invalid_ear" in result.reasons
