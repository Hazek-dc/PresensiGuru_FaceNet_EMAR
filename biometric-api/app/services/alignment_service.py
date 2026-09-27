"""Canonical Face Alignment & Quality Preprocessing Service.

TAHAP 13.29 — 5-Anchor Affine Alignment & Frame Boundary Validation.
Enforces deterministic face cropping, aspect-ratio preservation, and clipping checks.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, cos, sin, isfinite, hypot
from typing import Tuple, Sequence, Optional, Any


class AlignmentError(ValueError):
    """Raised when face alignment or anchor detection fails quality constraints."""


@dataclass(frozen=True, slots=True)
class FacialAnchors:
    """The 5 canonical facial anchors extracted by MTCNN/MediaPipe."""

    left_eye: Tuple[float, float]
    right_eye: Tuple[float, float]
    nose_tip: Tuple[float, float]
    mouth_left: Tuple[float, float]
    mouth_right: Tuple[float, float]


@dataclass(frozen=True, slots=True)
class AlignmentResult:
    """Result of canonical alignment and bounding box crop."""

    is_aligned: bool
    rotation_degrees: float
    interocular_distance: float
    crop_bounds: Tuple[int, int, int, int]  # (left, top, right, bottom)
    reasons: Tuple[str, ...]


# Canonical 5-anchor reference template (normalized 112x112 or 160x160 space)
CANONICAL_ANCHORS_160 = FacialAnchors(
    left_eye=(61.5, 62.5),
    right_eye=(98.5, 62.5),
    nose_tip=(80.0, 92.5),
    mouth_left=(65.0, 115.0),
    mouth_right=(95.0, 115.0),
)


class AlignmentService:
    """Canonical face alignment service.

    Validates that all 5 facial anchors are present, inside frame boundaries,
    and not severely rotated or clipped, before performing similarity alignment.
    """

    def __init__(self, target_size: int = 160, padding_ratio: float = 0.25) -> None:
        self._target_size = target_size
        self._padding_ratio = padding_ratio

    def validate_anchors(
        self, anchors: FacialAnchors, frame_width: int, frame_height: int
    ) -> Tuple[bool, Tuple[str, ...]]:
        """Verify anchors are inside valid frame boundaries with safety margin."""

        if frame_width <= 0 or frame_height <= 0:
            return False, ("invalid_frame_dimensions",)

        margin_x = frame_width * 0.02
        margin_y = frame_height * 0.02
        reasons = []

        all_points = (
            anchors.left_eye,
            anchors.right_eye,
            anchors.nose_tip,
            anchors.mouth_left,
            anchors.mouth_right,
        )

        for pt in all_points:
            x, y = pt
            if not (isfinite(x) and isfinite(y)):
                reasons.append("non_finite_anchor_coordinates")
                break
            if x < margin_x or x > (frame_width - margin_x) or y < margin_y or y > (frame_height - margin_y):
                reasons.append("anchor_clipped_at_frame_boundary")
                break

        interocular = hypot(anchors.right_eye[0] - anchors.left_eye[0], anchors.right_eye[1] - anchors.left_eye[1])
        if interocular < (frame_width * 0.08):
            reasons.append("interocular_distance_too_small")

        return len(reasons) == 0, tuple(dict.fromkeys(reasons))

    def compute_alignment_angle(self, anchors: FacialAnchors) -> float:
        """Compute the roll angle (in degrees) between the left and right eye centers."""

        dx = anchors.right_eye[0] - anchors.left_eye[0]
        dy = anchors.right_eye[1] - anchors.left_eye[1]
        radians = atan2(dy, dx)
        degrees = radians * (180.0 / 3.141592653589793)
        return degrees

    def calculate_crop_bounds(
        self, anchors: FacialAnchors, frame_width: int, frame_height: int
    ) -> Tuple[int, int, int, int]:
        """Compute proportional bounding box crop centered around face anchors."""

        all_x = (anchors.left_eye[0], anchors.right_eye[0], anchors.nose_tip[0], anchors.mouth_left[0], anchors.mouth_right[0])
        all_y = (anchors.left_eye[1], anchors.right_eye[1], anchors.nose_tip[1], anchors.mouth_left[1], anchors.mouth_right[1])

        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)

        width = max_x - min_x
        height = max_y - min_y
        size = max(width, height) * (1.0 + self._padding_ratio * 2)

        center_x = (min_x + max_x) / 2.0
        center_y = (min_y + max_y) / 2.0

        left = int(max(0.0, center_x - size / 2.0))
        top = int(max(0.0, center_y - size / 2.0))
        right = int(min(float(frame_width), center_x + size / 2.0))
        bottom = int(min(float(frame_height), center_y + size / 2.0))

        return left, top, right, bottom
