from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


APP_DIRECTORY = Path(__file__).resolve().parents[2] / "app"
if str(APP_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(APP_DIRECTORY))

from evaluation.evaluate_iso30107 import (  # noqa: E402
    ManifestValidationError,
    evaluate_presentations,
    read_manifest,
)


class Iso30107EvaluationTests(unittest.TestCase):
    def test_fta_is_excluded_from_apcer_and_bpcer_denominators(self) -> None:
        report = evaluate_presentations(
            [
                {"label": "attack", "pad_decision": "bona_fide", "fta": False},
                {"label": "attack", "pad_decision": "attack", "fta": False},
                # This would be an APCER error if FTA were incorrectly included.
                {"label": "attack", "pad_decision": "bona_fide", "fta": True},
                {"label": "bona_fide", "pad_decision": "attack", "fta": False},
                {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
                # This would be a BPCER error if FTA were incorrectly included.
                {"label": "bona_fide", "pad_decision": "attack", "fta": True},
            ]
        )

        self.assertEqual(report.fta_count, 2)
        self.assertEqual(report.attack_fta_count, 1)
        self.assertEqual(report.bona_fide_fta_count, 1)
        self.assertEqual(report.attack_evaluated_count, 2)
        self.assertEqual(report.bona_fide_evaluated_count, 2)
        self.assertEqual(report.apcer_error_count, 1)
        self.assertEqual(report.bpcer_error_count, 1)
        self.assertEqual(report.apcer, 0.5)
        self.assertEqual(report.bpcer, 0.5)
        self.assertEqual(report.acer, 0.5)
        self.assertAlmostEqual(report.fta_rate, 2 / 6)

    def test_reads_jsonl_and_csv_manifests(self) -> None:
        records = [
            {"label": "attack", "pad_decision": "attack", "fta": False},
            {"label": "bona_fide", "pad_decision": "bona_fide", "fta": False},
        ]
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            jsonl_path = directory / "presentations.jsonl"
            jsonl_path.write_text(
                "".join(f"{json.dumps(record)}\n" for record in records),
                encoding="utf-8",
            )
            csv_path = directory / "presentations.csv"
            csv_path.write_text(
                "label,pad_decision,fta\n"
                "attack,attack,false\n"
                "bona_fide,bona_fide,false\n",
                encoding="utf-8",
            )

            self.assertEqual(read_manifest(jsonl_path), read_manifest(csv_path))

    def test_rejects_bad_manifest_values(self) -> None:
        with self.assertRaises(ManifestValidationError):
            evaluate_presentations(
                [{"label": "unknown", "pad_decision": "attack", "fta": False}]
            )

        with self.assertRaises(ManifestValidationError):
            evaluate_presentations(
                [{"label": "attack", "pad_decision": "", "fta": False}]
            )

    def test_acer_is_undefined_when_one_class_has_no_non_fta_records(self) -> None:
        report = evaluate_presentations(
            [{"label": "attack", "pad_decision": "attack", "fta": False}]
        )

        self.assertEqual(report.apcer, 0.0)
        self.assertIsNone(report.bpcer)
        self.assertIsNone(report.acer)


if __name__ == "__main__":
    unittest.main()
