"""Final allow/deny fusion for identity verification and presentation attack detection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class FusionResult:
    """Explainable result of the identity-and-PAD gate."""

    identity_verified: bool
    pad_passed: bool
    final_decision: bool
    reasons: Tuple[str, ...]

    @property
    def accepted(self) -> bool:
        """Alias for consumers that use allow/deny language."""

        return self.final_decision


def _require_bool(value: object, name: str) -> bool:
    """Reject truthy strings/numbers so an ambiguous boundary cannot grant access."""

    if not isinstance(value, bool):
        raise TypeError(f"{name} must be a bool")
    return value


def fuse_predictions(identity_verified: bool, pad_passed: bool) -> FusionResult:
    """Apply the non-bypassable final rule: identity verification AND PAD.

    Each upstream outcome is included in ``reasons`` so an API layer can tell
    the caller which gate blocked the final decision without weakening the
    fusion rule.
    """

    identity = _require_bool(identity_verified, "identity_verified")
    pad = _require_bool(pad_passed, "pad_passed")
    final_decision = identity and pad
    reasons = (
        "identity_verified" if identity else "identity_not_verified",
        "pad_passed" if pad else "pad_not_passed",
    )
    return FusionResult(
        identity_verified=identity,
        pad_passed=pad,
        final_decision=final_decision,
        reasons=reasons,
    )


# Short alias for use in application boundaries.
fuse = fuse_predictions


class FusionService:
    """Small object facade for dependency-injected application layers."""

    def decide(self, identity_verified: bool, pad_passed: bool) -> FusionResult:
        return fuse_predictions(identity_verified, pad_passed)

    evaluate = decide
