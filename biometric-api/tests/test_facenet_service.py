from __future__ import annotations

import sys
from math import inf, nan
from pathlib import Path

import pytest


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.facenet_service import (  # noqa: E402
    EmbeddingDimensionMismatchError,
    FaceNetService,
    InvalidEmbeddingError,
)


def test_enrollment_l2_normalizes_gallery_embedding() -> None:
    service = FaceNetService(threshold=0.80)

    enrolled = service.enroll("employee-001", [3.0, 4.0])

    assert enrolled == pytest.approx((0.6, 0.8))


def test_verify_matches_l2_normalized_probe_at_injected_threshold() -> None:
    service = FaceNetService(threshold=0.95)
    service.enroll("employee-001", [1.0, 0.0])

    result = service.verify("employee-001", [12.0, 0.0])

    assert result.is_match is True
    assert result.similarity == pytest.approx(1.0)
    assert result.threshold == pytest.approx(0.95)


def test_verify_rejects_nonmatching_probe_at_injected_threshold() -> None:
    service = FaceNetService(threshold=0.50)
    service.enroll("employee-001", [1.0, 0.0])

    result = service.verify("employee-001", [0.0, 1.0])

    assert result.is_match is False
    assert result.similarity == pytest.approx(0.0)


@pytest.mark.parametrize(
    "embedding",
    [
        [0.0, 0.0],
        [nan, 1.0],
        [inf, 1.0],
        [],
    ],
)
def test_enrollment_rejects_invalid_embedding(embedding: list[float]) -> None:
    service = FaceNetService(threshold=0.80)

    with pytest.raises(InvalidEmbeddingError):
        service.enroll("employee-001", embedding)


def test_verify_rejects_invalid_probe_embedding() -> None:
    service = FaceNetService(threshold=0.80)
    service.enroll("employee-001", [1.0, 0.0])

    with pytest.raises(InvalidEmbeddingError):
        service.verify("employee-001", [0.0, 0.0])


def test_verify_rejects_dimension_mismatch() -> None:
    service = FaceNetService(threshold=0.80)
    service.enroll("employee-001", [1.0, 0.0])

    with pytest.raises(EmbeddingDimensionMismatchError):
        service.verify("employee-001", [1.0, 0.0, 0.0])
