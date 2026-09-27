"""ISO 30107-style PAD evaluation from explicit presentation manifests.

The accepted manifest schema is deliberately small and explicit:

* ``label``: ``bona_fide`` or ``attack``;
* ``pad_decision``: ``bona_fide`` or ``attack``; and
* ``fta``: a boolean (or the CSV literals ``true``/``false``).

JSONL contains one object per line.  CSV uses the same field names as headers.
FTA records are reported independently and never contribute to the APCER or
BPCER denominators.  An FTA record may have a blank ``pad_decision``, since no
PAD decision is necessarily produced when acquisition fails.
"""

from __future__ import annotations

import csv
import json
from collections.abc import Iterable, Mapping
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal, cast


PresentationLabel = Literal["bona_fide", "attack"]
PadDecision = Literal["bona_fide", "attack"]

_REQUIRED_FIELDS = frozenset({"label", "pad_decision", "fta"})
_VALID_LABELS = frozenset({"bona_fide", "attack"})


class ManifestValidationError(ValueError):
    """Raised when a PAD manifest record is malformed or ambiguous."""


@dataclass(frozen=True)
class Presentation:
    """One labelled presentation and its PAD outcome."""

    label: PresentationLabel
    pad_decision: PadDecision | None
    fta: bool


@dataclass(frozen=True)
class PadEvaluationReport:
    """Counts and rates produced by :func:`evaluate_presentations`.

    ``apcer``, ``bpcer``, and ``acer`` are ``None`` when their required
    denominator is unavailable.  ``acer`` is defined only when both APCER and
    BPCER are defined.
    """

    total_presentations: int
    fta_count: int
    fta_rate: float
    attack_fta_count: int
    bona_fide_fta_count: int
    attack_evaluated_count: int
    bona_fide_evaluated_count: int
    apcer_error_count: int
    bpcer_error_count: int
    apcer: float | None
    bpcer: float | None
    acer: float | None

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of this report."""

        return asdict(self)


def presentation_from_record(
    record: Mapping[str, Any], *, source: str = "record"
) -> Presentation:
    """Validate a manifest record and return its normalized representation.

    The three canonical fields are required even for an FTA record.  For FTA,
    ``pad_decision`` may be empty or ``null``; otherwise it must be one of the
    two explicit PAD classes.
    """

    if not isinstance(record, Mapping):
        raise ManifestValidationError(f"{source} must be an object with PAD fields")

    missing = _REQUIRED_FIELDS.difference(record)
    if missing:
        names = ", ".join(sorted(missing))
        raise ManifestValidationError(f"{source} is missing required field(s): {names}")

    label = _parse_label(record["label"], source=source)
    fta = _parse_fta(record["fta"], source=source)
    decision = _parse_decision(record["pad_decision"], fta=fta, source=source)
    return Presentation(label=label, pad_decision=decision, fta=fta)


def read_manifest(path: str | Path) -> list[Presentation]:
    """Read and validate a ``.jsonl`` or ``.csv`` PAD presentation manifest."""

    manifest_path = Path(path)
    suffix = manifest_path.suffix.lower()
    if suffix == ".jsonl":
        presentations = _read_jsonl(manifest_path)
    elif suffix == ".csv":
        presentations = _read_csv(manifest_path)
    else:
        raise ManifestValidationError(
            f"unsupported manifest format {manifest_path.suffix!r}; use .jsonl or .csv"
        )

    if not presentations:
        raise ManifestValidationError(f"{manifest_path} contains no presentation records")
    return presentations


def evaluate_presentations(
    presentations: Iterable[Presentation | Mapping[str, Any]],
) -> PadEvaluationReport:
    """Calculate PAD rates from validated presentations.

    APCER is the fraction of non-FTA attacks classified as ``bona_fide``.
    BPCER is the fraction of non-FTA bona fide presentations classified as
    ``attack``.  FTA records are counted separately and excluded from both
    denominators.
    """

    normalized = [
        _coerce_presentation(item, source=f"presentation {index}")
        for index, item in enumerate(presentations, start=1)
    ]
    if not normalized:
        raise ManifestValidationError("at least one presentation is required")

    fta_presentations = [presentation for presentation in normalized if presentation.fta]
    evaluated = [presentation for presentation in normalized if not presentation.fta]

    attacks = [presentation for presentation in evaluated if presentation.label == "attack"]
    bona_fide = [
        presentation for presentation in evaluated if presentation.label == "bona_fide"
    ]

    apcer_errors = sum(
        presentation.pad_decision == "bona_fide" for presentation in attacks
    )
    bpcer_errors = sum(
        presentation.pad_decision == "attack" for presentation in bona_fide
    )

    apcer = _rate(apcer_errors, len(attacks))
    bpcer = _rate(bpcer_errors, len(bona_fide))
    acer = None if apcer is None or bpcer is None else (apcer + bpcer) / 2

    return PadEvaluationReport(
        total_presentations=len(normalized),
        fta_count=len(fta_presentations),
        fta_rate=len(fta_presentations) / len(normalized),
        attack_fta_count=sum(
            presentation.label == "attack" for presentation in fta_presentations
        ),
        bona_fide_fta_count=sum(
            presentation.label == "bona_fide" for presentation in fta_presentations
        ),
        attack_evaluated_count=len(attacks),
        bona_fide_evaluated_count=len(bona_fide),
        apcer_error_count=apcer_errors,
        bpcer_error_count=bpcer_errors,
        apcer=apcer,
        bpcer=bpcer,
        acer=acer,
    )


def evaluate_manifest(path: str | Path) -> PadEvaluationReport:
    """Read a manifest and evaluate its PAD results."""

    return evaluate_presentations(read_manifest(path))


def evaluate_iso30107(path: str | Path) -> PadEvaluationReport:
    """Convenience entry point named for the ISO 30107-style evaluator."""

    return evaluate_manifest(path)


def _read_jsonl(path: Path) -> list[Presentation]:
    presentations: list[Presentation] = []
    with path.open("r", encoding="utf-8-sig") as manifest_file:
        for line_number, line in enumerate(manifest_file, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ManifestValidationError(
                    f"{path}:{line_number} is not valid JSON: {error.msg}"
                ) from error
            presentations.append(
                presentation_from_record(record, source=f"{path}:{line_number}")
            )
    return presentations


def _read_csv(path: Path) -> list[Presentation]:
    with path.open("r", encoding="utf-8-sig", newline="") as manifest_file:
        reader = csv.DictReader(manifest_file)
        fieldnames = reader.fieldnames
        if fieldnames is None:
            raise ManifestValidationError(f"{path} must include a CSV header")
        if len(fieldnames) != len(set(fieldnames)):
            raise ManifestValidationError(f"{path} has duplicate CSV header names")

        missing = _REQUIRED_FIELDS.difference(fieldnames)
        if missing:
            names = ", ".join(sorted(missing))
            raise ManifestValidationError(
                f"{path} is missing required CSV column(s): {names}"
            )

        presentations: list[Presentation] = []
        for line_number, record in enumerate(reader, start=2):
            if None in record:
                raise ManifestValidationError(
                    f"{path}:{line_number} has more values than CSV headers"
                )
            presentations.append(
                presentation_from_record(record, source=f"{path}:{line_number}")
            )
    return presentations


def _coerce_presentation(
    item: Presentation | Mapping[str, Any], *, source: str
) -> Presentation:
    if isinstance(item, Presentation):
        return presentation_from_record(asdict(item), source=source)
    return presentation_from_record(item, source=source)


def _parse_label(value: Any, *, source: str) -> PresentationLabel:
    label = _normalize_class(value, field="label", source=source)
    return cast(PresentationLabel, label)


def _parse_decision(
    value: Any, *, fta: bool, source: str
) -> PadDecision | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if fta:
            return None
        raise ManifestValidationError(
            f"{source} has no pad_decision for a non-FTA presentation"
        )

    decision = _normalize_class(value, field="pad_decision", source=source)
    return cast(PadDecision, decision)


def _normalize_class(value: Any, *, field: str, source: str) -> str:
    if not isinstance(value, str):
        raise ManifestValidationError(
            f"{source} field {field!r} must be 'bona_fide' or 'attack'"
        )

    normalized = value.strip().lower()
    if normalized not in _VALID_LABELS:
        raise ManifestValidationError(
            f"{source} field {field!r} must be 'bona_fide' or 'attack'"
        )
    return normalized


def _parse_fta(value: Any, *, source: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized == "true":
            return True
        if normalized == "false":
            return False
    raise ManifestValidationError(
        f"{source} field 'fta' must be a boolean or the CSV literal true/false"
    )


def _rate(errors: int, denominator: int) -> float | None:
    return None if denominator == 0 else errors / denominator


__all__ = [
    "ManifestValidationError",
    "PadEvaluationReport",
    "PadDecision",
    "Presentation",
    "PresentationLabel",
    "evaluate_iso30107",
    "evaluate_manifest",
    "evaluate_presentations",
    "presentation_from_record",
    "read_manifest",
]
