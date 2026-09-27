"""Unit tests for Canonical Alignment and Session Security Isolation.
TAHAP 13.29 & 13.30 — Backend Verification Tests.
"""

import pytest
from app.services.alignment_service import AlignmentService, FacialAnchors
from app.services.session_service import SessionService, SessionStatus


def test_alignment_service_validates_anchors_correctly():
    service = AlignmentService(target_size=160)

    # Valid anchors well within 640x480 frame
    anchors = FacialAnchors(
        left_eye=(250.0, 200.0),
        right_eye=(390.0, 200.0),
        nose_tip=(320.0, 250.0),
        mouth_left=(270.0, 310.0),
        mouth_right=(370.0, 310.0),
    )

    is_valid, reasons = service.validate_anchors(anchors, frame_width=640, frame_height=480)
    assert is_valid is True
    assert len(reasons) == 0

    angle = service.compute_alignment_angle(anchors)
    assert abs(angle) < 1.0  # Horizontal eyes -> near 0 angle

    crop = service.calculate_crop_bounds(anchors, frame_width=640, frame_height=480)
    assert crop[0] >= 0 and crop[1] >= 0
    assert crop[2] <= 640 and crop[3] <= 480


def test_alignment_service_rejects_clipped_anchors():
    service = AlignmentService(target_size=160)

    # Left eye clipped at frame boundary (x = 5.0 in 640x480 frame)
    clipped_anchors = FacialAnchors(
        left_eye=(5.0, 200.0),
        right_eye=(140.0, 200.0),
        nose_tip=(70.0, 250.0),
        mouth_left=(40.0, 310.0),
        mouth_right=(100.0, 310.0),
    )

    is_valid, reasons = service.validate_anchors(clipped_anchors, frame_width=640, frame_height=480)
    assert is_valid is False
    assert "anchor_clipped_at_frame_boundary" in reasons


def test_session_service_isolates_and_prevents_replay():
    service = SessionService(default_ttl=30.0)

    session = service.create_session(claimed_subject_id="user_123")
    assert session.session_id.startswith("vsec_")
    assert session.claimed_subject_id == "user_123"

    # First consumption succeeds
    ok, sess, reasons = service.validate_and_consume(session.session_id, "user_123")
    assert ok is True
    assert len(reasons) == 0

    # Second consumption fails (replay attempt protection)
    ok_replay, sess_replay, reasons_replay = service.validate_and_consume(session.session_id, "user_123")
    assert ok_replay is False
    assert "replay_attempt_detected" in reasons_replay
    assert sess_replay.status == SessionStatus.FAILED


def test_session_service_rejects_subject_mismatch():
    service = SessionService(default_ttl=30.0)

    session = service.create_session(claimed_subject_id="user_123")

    # Mismatched subject ID attempt
    ok, sess, reasons = service.validate_and_consume(session.session_id, "user_456")
    assert ok is False
    assert "claimed_subject_mismatch" in reasons
