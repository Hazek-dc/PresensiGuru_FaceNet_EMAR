"""Landmark-based eye/mouth challenge primitives.

This module deliberately has no production thresholds.  A caller must supply
an :class:`EMARConfig` for every liveness session, so calibration remains
outside of the domain service.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import math
from numbers import Real
from typing import Any, Mapping, Optional, Sequence, Tuple


class LandmarkValidationError(ValueError):
    """Raised when a landmark collection cannot be interpreted as 2-D points."""


class EMARStatus(str, Enum):
    """The lifecycle state of a liveness challenge."""

    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"


@dataclass(frozen=True)
class BlinkObservation:
    """Result of adding one valid EAR sample to a :class:`BlinkTracker`."""

    is_closed: bool
    blink_detected: bool
    blink_count: int


@dataclass(frozen=True)
class EMARConfig:
    """Caller-calibrated policy for one EMAR liveness challenge.

    ``mar_open_threshold=None`` disables the mouth-open requirement.  All
    other values, including the time limit, are intentionally required rather
    than supplied from a production default.
    """

    ear_closed_threshold: float
    mar_open_threshold: Optional[float]
    required_blinks: int
    max_seconds: float

    def __post_init__(self) -> None:
        _require_finite_number(self.ear_closed_threshold, "ear_closed_threshold")
        if self.mar_open_threshold is not None:
            _require_finite_number(self.mar_open_threshold, "mar_open_threshold")

        if isinstance(self.required_blinks, bool) or not isinstance(
            self.required_blinks, int
        ):
            raise ValueError("required_blinks must be an integer")
        if self.required_blinks < 0:
            raise ValueError("required_blinks must be greater than or equal to zero")

        max_seconds = _require_finite_number(self.max_seconds, "max_seconds")
        if max_seconds <= 0:
            raise ValueError("max_seconds must be greater than zero")


@dataclass(frozen=True)
class EMARResult:
    """A serialisable snapshot of the current liveness challenge."""

    status: EMARStatus
    passed: bool
    reasons: Tuple[str, ...]
    blink_count: int
    mouth_open_seen: bool
    ear: Optional[float]
    mar: Optional[float]
    elapsed_seconds: Optional[float]

    @property
    def completed(self) -> bool:
        """Whether this challenge has reached a terminal decision."""

        return self.status is not EMARStatus.PENDING

    @property
    def final_decision(self) -> bool:
        """Compatibility-friendly name for the allow/deny outcome."""

        return self.passed


def _require_finite_number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(f"{name} must be a finite number")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{name} must be a finite number")
    return number


def _point_from_landmark(landmark: Any, label: str) -> Tuple[float, float]:
    """Read a 2-D point from common landmark representations.

    The public metric functions support ``(x, y)`` sequences, mappings with
    ``x``/``y`` keys, and objects exposing ``.x``/``.y`` (such as MediaPipe
    landmark objects).  Invalid data is reported explicitly instead of being
    converted into a plausible-looking ratio.
    """

    x: Any
    y: Any
    if isinstance(landmark, Mapping):
        if "x" not in landmark or "y" not in landmark:
            raise LandmarkValidationError(f"{label} must contain x and y values")
        x, y = landmark["x"], landmark["y"]
    elif hasattr(landmark, "x") and hasattr(landmark, "y"):
        x, y = landmark.x, landmark.y
    elif isinstance(landmark, Sequence) and not isinstance(
        landmark, (str, bytes, bytearray)
    ):
        if len(landmark) < 2:
            raise LandmarkValidationError(f"{label} must contain at least two values")
        x, y = landmark[0], landmark[1]
    else:
        raise LandmarkValidationError(
            f"{label} must be a point sequence, mapping, or object with x/y"
        )

    try:
        x_value = float(x)
        y_value = float(y)
    except (TypeError, ValueError, OverflowError) as error:
        raise LandmarkValidationError(f"{label} coordinates must be numeric") from error

    if not math.isfinite(x_value) or not math.isfinite(y_value):
        raise LandmarkValidationError(f"{label} coordinates must be finite")
    return x_value, y_value


def _coerce_landmarks(
    landmarks: Sequence[Any], expected_count: int, label: str
) -> Tuple[Tuple[float, float], ...]:
    if isinstance(landmarks, (str, bytes, bytearray)) or not isinstance(
        landmarks, Sequence
    ):
        raise LandmarkValidationError(f"{label} landmarks must be an ordered sequence")
    if len(landmarks) != expected_count:
        raise LandmarkValidationError(
            f"{label} landmarks must contain exactly {expected_count} points"
        )
    return tuple(
        _point_from_landmark(landmark, f"{label}[{index}]")
        for index, landmark in enumerate(landmarks)
    )


def _distance(first: Tuple[float, float], second: Tuple[float, float]) -> float:
    return math.hypot(first[0] - second[0], first[1] - second[1])


def compute_ear(eye_landmarks: Sequence[Any]) -> Optional[float]:
    """Compute eye-aspect ratio from six ordered eye contour landmarks.

    Landmarks use the conventional order ``p1..p6``.  A degenerate eye width
    has no meaningful ratio, so it returns ``None`` instead of dividing by
    zero.  Malformed landmark input raises :class:`LandmarkValidationError`.
    """

    points = _coerce_landmarks(eye_landmarks, expected_count=6, label="eye")
    vertical_a = _distance(points[1], points[5])
    vertical_b = _distance(points[2], points[4])
    denominator = 2.0 * _distance(points[0], points[3])
    if denominator == 0.0:
        return None

    ratio = (vertical_a + vertical_b) / denominator
    return ratio if math.isfinite(ratio) else None


def compute_mar(mouth_landmarks: Sequence[Any]) -> Optional[float]:
    """Compute mouth-aspect ratio from eight ordered mouth contour landmarks.

    The formula is ``(d(p2,p8) + d(p3,p7) + d(p4,p6)) / (2*d(p1,p5))``.
    As with EAR, a degenerate horizontal width returns ``None``.
    """

    points = _coerce_landmarks(mouth_landmarks, expected_count=8, label="mouth")
    vertical_a = _distance(points[1], points[7])
    vertical_b = _distance(points[2], points[6])
    vertical_c = _distance(points[3], points[5])
    denominator = 2.0 * _distance(points[0], points[4])
    if denominator == 0.0:
        return None

    ratio = (vertical_a + vertical_b + vertical_c) / denominator
    return ratio if math.isfinite(ratio) else None


# Common names kept as explicit aliases for consumers that use the verb
# "calculate" rather than "compute" in their boundary layer.
calculate_ear = compute_ear
calculate_mar = compute_mar


class BlinkTracker:
    """Count only open -> closed -> open EAR transitions as blinks."""

    def __init__(self, ear_closed_threshold: float) -> None:
        self._ear_closed_threshold = _require_finite_number(
            ear_closed_threshold, "ear_closed_threshold"
        )
        self.reset()

    @property
    def blink_count(self) -> int:
        return self._blink_count

    def reset(self) -> None:
        self._blink_count = 0
        self._saw_open_eye = False
        self._closed_after_open = False

    def invalidate_transition(self) -> None:
        """Drop an incomplete transition after an unusable EAR frame.

        Keeping a partial closed state across missing/corrupt landmarks could
        manufacture a blink when the next valid frame happens to be open.
        """

        self._closed_after_open = False

    def observe(self, ear: float) -> BlinkObservation:
        ear_value = _require_finite_number(ear, "ear")
        is_closed = ear_value < self._ear_closed_threshold
        blink_detected = False

        if is_closed:
            if self._saw_open_eye:
                self._closed_after_open = True
        else:
            if self._closed_after_open:
                self._blink_count += 1
                blink_detected = True
                self._closed_after_open = False
            self._saw_open_eye = True

        return BlinkObservation(
            is_closed=is_closed,
            blink_detected=blink_detected,
            blink_count=self._blink_count,
        )


class EMARService:
    """Stateful evaluator for a caller-calibrated blink/mouth challenge.

    Call :meth:`observe_metrics` when the boundary has already computed EAR
    and MAR, or :meth:`observe_landmarks` to calculate both metrics here.
    Timestamps are supplied by the caller; the service never invents a time
    limit.  Once the configured time budget is reached, the session enters a
    terminal failed state and cannot later be turned into a pass.
    """

    def __init__(self, config: EMARConfig) -> None:
        self._config = config
        self.reset()

    @property
    def config(self) -> EMARConfig:
        return self._config

    def reset(self) -> None:
        self._blink_tracker = BlinkTracker(self._config.ear_closed_threshold)
        self._started_at: Optional[float] = None
        self._status = EMARStatus.PENDING
        self._terminal_reasons: Tuple[str, ...] = ()
        self._mouth_open_seen = False
        self._last_ear: Optional[float] = None
        self._last_mar: Optional[float] = None
        self._last_elapsed: Optional[float] = None

    def observe_landmarks(
        self,
        eye_landmarks: Sequence[Any],
        mouth_landmarks: Sequence[Any],
        timestamp: float,
    ) -> EMARResult:
        """Calculate metrics from landmarks and update the challenge safely."""

        issues = []
        try:
            ear = compute_ear(eye_landmarks)
        except LandmarkValidationError:
            ear = None
            issues.append("invalid_eye_landmarks")

        try:
            mar = compute_mar(mouth_landmarks)
        except LandmarkValidationError:
            mar = None
            issues.append("invalid_mouth_landmarks")

        return self._observe_metrics(ear, mar, timestamp, tuple(issues))

    def observe_metrics(
        self, ear: Optional[float], mar: Optional[float], timestamp: float
    ) -> EMARResult:
        """Update the challenge with precomputed metrics."""

        return self._observe_metrics(ear, mar, timestamp, ())

    # A concise boundary-friendly alias.  It intentionally keeps the same
    # state semantics as ``observe_landmarks``.
    process_frame = observe_landmarks

    def _observe_metrics(
        self,
        ear: Optional[float],
        mar: Optional[float],
        timestamp: float,
        input_issues: Tuple[str, ...],
    ) -> EMARResult:
        if self._status is not EMARStatus.PENDING:
            return self._result(self._status, self._terminal_reasons)

        timestamp_value = _optional_finite_number(timestamp)
        if timestamp_value is None:
            return self._fail("invalid_timestamp")

        if self._started_at is None:
            self._started_at = timestamp_value

        elapsed = timestamp_value - self._started_at
        self._last_elapsed = elapsed
        if elapsed < 0.0:
            return self._fail("invalid_timestamp")
        # Timeout is deliberately checked before processing a frame at the
        # deadline.  A late frame must never convert an expired session into a
        # successful PAD result.
        if elapsed >= self._config.max_seconds:
            return self._fail("timeout")

        ear_value = _optional_finite_number(ear)
        mar_value = _optional_finite_number(mar)
        issues = list(input_issues)

        if ear_value is None:
            self._blink_tracker.invalidate_transition()
            issues.append("invalid_ear")
        else:
            self._last_ear = ear_value
            self._blink_tracker.observe(ear_value)

        if mar_value is None:
            if self._config.mar_open_threshold is not None:
                issues.append("invalid_mar")
        else:
            self._last_mar = mar_value
            if (
                self._config.mar_open_threshold is not None
                and mar_value >= self._config.mar_open_threshold
            ):
                self._mouth_open_seen = True

        if self._challenge_satisfied():
            self._status = EMARStatus.PASSED
            self._terminal_reasons = ("challenge_completed",)
            return self._result(self._status, self._terminal_reasons, ear_value, mar_value)

        reasons = tuple(dict.fromkeys(issues + self._pending_reasons()))
        return self._result(EMARStatus.PENDING, reasons, ear_value, mar_value)

    def _challenge_satisfied(self) -> bool:
        has_required_blinks = self._blink_tracker.blink_count >= self._config.required_blinks
        mouth_requirement_satisfied = (
            self._config.mar_open_threshold is None or self._mouth_open_seen
        )
        return has_required_blinks and mouth_requirement_satisfied

    def _pending_reasons(self) -> list[str]:
        reasons = []
        if self._blink_tracker.blink_count < self._config.required_blinks:
            reasons.append("blinks_pending")
        if self._config.mar_open_threshold is not None and not self._mouth_open_seen:
            reasons.append("mouth_open_pending")
        return reasons

    def _fail(self, reason: str) -> EMARResult:
        self._status = EMARStatus.FAILED
        self._terminal_reasons = (reason,)
        return self._result(self._status, self._terminal_reasons)

    def _result(
        self,
        status: EMARStatus,
        reasons: Tuple[str, ...],
        ear: Optional[float] = None,
        mar: Optional[float] = None,
    ) -> EMARResult:
        return EMARResult(
            status=status,
            passed=status is EMARStatus.PASSED,
            reasons=reasons,
            blink_count=self._blink_tracker.blink_count,
            mouth_open_seen=self._mouth_open_seen,
            ear=self._last_ear if ear is None else ear,
            mar=self._last_mar if mar is None else mar,
            elapsed_seconds=self._last_elapsed,
        )


def _optional_finite_number(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None
