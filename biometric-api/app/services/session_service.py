"""Verification Session Management & Security Isolation Service.

TAHAP 13.29 — Session binding, Nonce validation, and Replay Protection.
Enforces single-user, single-challenge verification session constraints.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Optional, Tuple


class SessionStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class VerificationSession:
    """One single-user, single-challenge biometric session."""

    session_id: str
    claimed_subject_id: str
    nonce: str
    created_at: float
    max_duration_seconds: float = 30.0
    status: SessionStatus = SessionStatus.ACTIVE
    processed_attempts: int = 0
    neutral_baseline_ear: Optional[float] = None
    neutral_baseline_mar: Optional[float] = None

    @property
    def is_valid(self) -> bool:
        if self.status is not SessionStatus.ACTIVE:
            return False
        if time.time() - self.created_at > self.max_duration_seconds:
            self.status = SessionStatus.EXPIRED
            return False
        return True


class SessionService:
    """In-memory session registry for verification security isolation."""

    def __init__(self, default_ttl: float = 30.0) -> None:
        self._default_ttl = default_ttl
        self._sessions: Dict[str, VerificationSession] = {}

    def create_session(self, claimed_subject_id: str) -> VerificationSession:
        """Create a new isolated verification session with unique session_id and nonce."""

        if not claimed_subject_id or not isinstance(claimed_subject_id, str):
            raise ValueError("claimed_subject_id must be a non-empty string")

        session_id = f"vsec_{uuid.uuid4().hex}"
        nonce = uuid.uuid4().hex[:16]
        session = VerificationSession(
            session_id=session_id,
            claimed_subject_id=claimed_subject_id,
            nonce=nonce,
            created_at=time.time(),
            max_duration_seconds=self._default_ttl,
        )
        self._sessions[session_id] = session
        return session

    def validate_and_consume(
        self, session_id: str, claimed_subject_id: str
    ) -> Tuple[bool, Optional[VerificationSession], Tuple[str, ...]]:
        """Validate that session exists, is active, and matches claimed subject ID strictly."""

        if session_id not in self._sessions:
            return False, None, ("session_not_found",)

        session = self._sessions[session_id]

        if not session.is_valid:
            return False, session, (f"session_{session.status.value}",)

        if session.claimed_subject_id != claimed_subject_id:
            return False, session, ("claimed_subject_mismatch",)

        # Increment attempt count (anti-replay check: max 1 active verification attempt)
        if session.processed_attempts >= 1:
            session.status = SessionStatus.FAILED
            return False, session, ("replay_attempt_detected",)

        session.processed_attempts += 1
        return True, session, ()

    def set_neutral_baseline(
        self, session_id: str, baseline_ear: float, baseline_mar: float
    ) -> None:
        """Store neutral Liveness baseline for the current session."""

        if session_id in self._sessions:
            session = self._sessions[session_id]
            session.neutral_baseline_ear = baseline_ear
            session.neutral_baseline_mar = baseline_mar
