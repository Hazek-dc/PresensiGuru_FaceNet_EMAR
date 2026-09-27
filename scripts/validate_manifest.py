#!/usr/bin/env python3
"""
Manifest Validator for FaceNet-EMAR Project (Phase 0).
Validates a CSV manifest against the JSON schema and checks for:
- Duplicate sample_ids
- PII in subject_ids
- Data leakage (overlap) between DEVELOPMENT, CALIBRATION, and TEST splits.
"""

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

def validate_manifest(csv_path: Path, schema_path: Path):
    try:
        import jsonschema
    except ImportError:
        print("Error: jsonschema library is required. Run `pip install jsonschema`.")
        sys.exit(1)

    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    errors = []
    sample_ids = set()
    split_subjects = defaultdict(set)
    split_sessions = defaultdict(set)

    for i, row in enumerate(rows, start=2):
        # Convert empty strings to None for validation, except for required string fields
        clean_row = {}
        for k, v in row.items():
            if v == "" and k in ["lux", "distance_cm", "exclusion_reason"]:
                clean_row[k] = None
            elif v == "" and k in schema["properties"] and "null" in schema["properties"][k].get("type", []):
                clean_row[k] = None
            else:
                if k in ["lux", "distance_cm"] and v != "":
                    try:
                        clean_row[k] = float(v)
                    except ValueError:
                        clean_row[k] = v
                else:
                    clean_row[k] = v

        try:
            jsonschema.validate(instance=clean_row, schema=schema)
        except jsonschema.exceptions.ValidationError as e:
            errors.append(f"Row {i} schema error: {e.message}")

        # Check duplicates
        sample_id = clean_row.get("sample_id")
        if sample_id in sample_ids:
            errors.append(f"Row {i} error: Duplicate sample_id '{sample_id}'")
        sample_ids.add(sample_id)

        # Check PII (naive check: no spaces allowed, shouldn't look like a real name)
        subject_id = clean_row.get("subject_id", "")
        if " " in subject_id or re.match(r'^[A-Z][a-z]+ [A-Z][a-z]+', subject_id):
            errors.append(f"Row {i} error: subject_id '{subject_id}' appears to contain PII/Real Name")

        # Record for split overlap check
        split = clean_row.get("split")
        if split and split != "EXCLUDED":
            split_subjects[split].add(subject_id)
            session_id = clean_row.get("session_id")
            if session_id:
                split_sessions[split].add(session_id)

    # Check overlaps
    active_splits = ["DEVELOPMENT", "CALIBRATION", "TEST"]
    for i in range(len(active_splits)):
        for j in range(i + 1, len(active_splits)):
            split1, split2 = active_splits[i], active_splits[j]
            overlap_subj = split_subjects[split1].intersection(split_subjects[split2])
            if overlap_subj:
                errors.append(f"Data Leakage: {split1} and {split2} share subjects: {overlap_subj}")
            
            overlap_sess = split_sessions[split1].intersection(split_sessions[split2])
            if overlap_sess:
                errors.append(f"Data Leakage: {split1} and {split2} share sessions: {overlap_sess}")

    if errors:
        print(f"Validation FAILED with {len(errors)} errors:")
        for err in errors:
            print(f" - {err}")
        sys.exit(1)
    else:
        print("Validation PASSED: Manifest is compliant with Data Governance rules.")
        sys.exit(0)

if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent.parent
    csv_file = base_dir / "research" / "manifests" / "synthetic_sample.csv"
    schema_file = base_dir / "research" / "manifests" / "schema.json"
    
    if not csv_file.exists() or not schema_file.exists():
        print("Error: Missing schema.json or synthetic_sample.csv in research/manifests/")
        sys.exit(1)
        
    validate_manifest(csv_file, schema_file)
