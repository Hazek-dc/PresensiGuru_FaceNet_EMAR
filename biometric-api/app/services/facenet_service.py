"""FaceNet embedding enrollment and one-to-one verification.

This module intentionally contains no product threshold or configuration lookup.
The caller supplies the decision threshold when constructing ``FaceNetService``.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from math import fsum, hypot, isfinite
from typing import Any


class InvalidEmbeddingError(ValueError):
    """Raised when an embedding cannot be safely L2-normalized."""


class EmbeddingDimensionMismatchError(ValueError):
    """Raised when a probe and its enrolled gallery vector differ in size."""


@dataclass(frozen=True, slots=True)
class VerificationResult:
    """The result of comparing one enrolled gallery embedding with one probe."""

    subject_id: str
    similarity: float
    threshold: float
    is_match: bool


class FaceNetService:
    """In-memory FaceNet gallery with strict one-to-one verification.

    ``threshold`` is a required dependency rather than a domain default.  It is
    compared against cosine similarity after both vectors have been L2-normalized.
    """

    def __init__(self, threshold: float) -> None:
        self._threshold = self._validate_threshold(threshold)
        self._gallery: dict[str, tuple[float, ...]] = {}

    @property
    def threshold(self) -> float:
        """Return the caller-supplied decision threshold."""

        return self._threshold

    def enroll(self, subject_id: str, embedding: Iterable[float]) -> tuple[float, ...]:
        """L2-normalize and store a gallery embedding for ``subject_id``.

        Re-enrolling the same subject intentionally replaces that subject's
        gallery vector; it never searches across identities.
        """

        self._validate_subject_id(subject_id)
        normalized_embedding = self.normalize_embedding(embedding)
        self._gallery[subject_id] = normalized_embedding
        return normalized_embedding

    def verify(self, subject_id: str, probe_embedding: Iterable[float]) -> VerificationResult:
        """Compare one probe only with the gallery vector for ``subject_id``.

        The gallery and probe use the exact same ``normalize_embedding`` method.
        A missing enrollment raises ``KeyError`` and a different vector length
        raises ``EmbeddingDimensionMismatchError`` rather than silently scoring it.
        """

        self._validate_subject_id(subject_id)
        try:
            gallery_embedding = self._gallery[subject_id]
        except KeyError as error:
            raise KeyError(f"No gallery embedding enrolled for subject '{subject_id}'.") from error

        probe = self.normalize_embedding(probe_embedding)
        if len(gallery_embedding) != len(probe):
            raise EmbeddingDimensionMismatchError(
                "Gallery and probe embeddings must have the same dimension "
                f"(got {len(gallery_embedding)} and {len(probe)})."
            )

        similarity = self._cosine_similarity(gallery_embedding, probe)
        return VerificationResult(
            subject_id=subject_id,
            similarity=similarity,
            threshold=self._threshold,
            is_match=similarity >= self._threshold,
        )

    @staticmethod
    def normalize_embedding(embedding: Iterable[float]) -> tuple[float, ...]:
        """Return a finite, non-zero embedding as an L2-unit tuple.

        The method accepts one-dimensional iterable vectors, including common
        numeric array types, and rejects empty, zero, non-finite, or malformed
        vectors before a similarity score can be calculated.
        """

        if isinstance(embedding, (str, bytes)):
            raise InvalidEmbeddingError("Embedding must be a one-dimensional numeric iterable.")

        ndim = getattr(embedding, "ndim", None)
        if ndim is not None and ndim != 1:
            raise InvalidEmbeddingError("Embedding must be one-dimensional.")

        try:
            values = tuple(FaceNetService._finite_coordinate(value) for value in embedding)
        except TypeError as error:
            raise InvalidEmbeddingError("Embedding must be a one-dimensional numeric iterable.") from error

        if not values:
            raise InvalidEmbeddingError("Embedding cannot be empty.")

        # ``hypot`` avoids overflow/underflow that can occur when squaring large
        # but individually finite FaceNet coordinates.
        norm = hypot(*values)
        if not isfinite(norm) or norm == 0.0:
            raise InvalidEmbeddingError("Embedding must have a finite, non-zero L2 norm.")

        return tuple(value / norm for value in values)

    @staticmethod
    def _finite_coordinate(value: Any) -> float:
        if isinstance(value, bool):
            raise InvalidEmbeddingError("Embedding coordinates must be finite numbers.")

        try:
            coordinate = float(value)
        except (TypeError, ValueError, OverflowError) as error:
            raise InvalidEmbeddingError("Embedding coordinates must be finite numbers.") from error

        if not isfinite(coordinate):
            raise InvalidEmbeddingError("Embedding coordinates must be finite numbers.")
        return coordinate

    @staticmethod
    def _cosine_similarity(
        gallery_embedding: tuple[float, ...], probe_embedding: tuple[float, ...]
    ) -> float:
        """Calculate cosine similarity for already L2-normalized vectors."""

        similarity = fsum(
            gallery_coordinate * probe_coordinate
            for gallery_coordinate, probe_coordinate in zip(gallery_embedding, probe_embedding)
        )
        # Rounding can produce a value infinitesimally outside cosine's range.
        return max(-1.0, min(1.0, similarity))

    @staticmethod
    def _validate_threshold(threshold: float) -> float:
        if isinstance(threshold, bool):
            raise ValueError("Threshold must be a finite number between -1 and 1.")

        try:
            value = float(threshold)
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError("Threshold must be a finite number between -1 and 1.") from error

        if not isfinite(value) or not -1.0 <= value <= 1.0:
            raise ValueError("Threshold must be a finite number between -1 and 1.")
        return value

    @staticmethod
    def _validate_subject_id(subject_id: str) -> None:
        if not isinstance(subject_id, str) or not subject_id.strip():
            raise ValueError("Subject ID must be a non-empty string.")
