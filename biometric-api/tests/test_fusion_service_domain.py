from __future__ import annotations

from pathlib import Path
import sys

import pytest


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.fusion_service import FusionService, fuse_predictions  # noqa: E402


@pytest.mark.parametrize(
    ("identity_verified", "pad_passed", "expected_final"),
    [
        (True, True, True),
        (True, False, False),
        (False, True, False),
        (False, False, False),
    ],
)
def test_fusion_domain_uses_strict_identity_and_pad_gate(
    identity_verified: bool, pad_passed: bool, expected_final: bool
) -> None:
    result = fuse_predictions(identity_verified, pad_passed)

    assert result.final_decision is expected_final
    assert result.accepted is expected_final
    assert result.identity_verified is identity_verified
    assert result.pad_passed is pad_passed


def test_fusion_domain_exposes_each_blocking_reason() -> None:
    result = FusionService().decide(identity_verified=False, pad_passed=False)

    assert result.final_decision is False
    assert result.reasons == ("identity_not_verified", "pad_not_passed")


def test_fusion_domain_rejects_ambiguous_truthy_values() -> None:
    with pytest.raises(TypeError, match="identity_verified"):
        fuse_predictions("true", True)  # type: ignore[arg-type]
