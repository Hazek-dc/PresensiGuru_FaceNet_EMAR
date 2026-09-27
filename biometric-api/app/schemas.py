from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class AcquisitionStatus(str, Enum):
    OK = "OK"
    FTA = "FTA"
    INVALID_CLAIM = "INVALID_CLAIM"

class Decision(str, Enum):
    MATCH = "MATCH"
    NON_MATCH = "NON_MATCH"
    NOT_EVALUATED = "NOT_EVALUATED"

class PadDecision(str, Enum):
    BONA_FIDE = "BONA_FIDE"
    ATTACK = "ATTACK"
    NOT_EVALUATED = "NOT_EVALUATED"

class FinalDecision(str, Enum):
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"

class IdentityResult(BaseModel):
    decision: Decision
    score: Optional[float] = None

class PadResult(BaseModel):
    decision: PadDecision

class VerificationResponse(BaseModel):
    request_id: str
    claimed_subject_id: str
    acquisition_status: AcquisitionStatus
    identity: IdentityResult
    pad: PadResult
    final_decision: FinalDecision
    reasons: List[str]
    model_version: Optional[str] = "1.0.0"
    config_version: Optional[str] = "1.0.0"
