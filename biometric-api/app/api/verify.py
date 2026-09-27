from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.schemas import (
    VerificationResponse, AcquisitionStatus, IdentityResult, 
    PadResult, FinalDecision, Decision, PadDecision
)
from app.services.fusion_service import fuse_predictions

router = APIRouter()

@router.post("/verify", response_model=VerificationResponse)
async def verify(
    claimed_subject_id: str = Form(...),
    video: UploadFile = File(...)
):
    """
    Verify identity and PAD from video.
    """
    # TODO: Implement actual MTCNN face detection and EMAR liveness
    # For now, we mock the behavior based on the acceptance criteria
    
    # Example Mock Response
    # In reality, this would invoke face_detector.py, embedder.py, and liveness.py
    
    if not claimed_subject_id:
        raise HTTPException(status_code=400, detail="claimed_subject_id is required")

    if claimed_subject_id == "unknown_id":
        raise HTTPException(status_code=404, detail="Claimed subject ID not found in gallery")

    # MOCK LOGIC (To be replaced with real ML services)
    identity_decision = Decision.MATCH
    pad_decision = PadDecision.BONA_FIDE
    score = 0.85
    
    is_identity_match = (identity_decision == Decision.MATCH)
    is_pad_pass = (pad_decision == PadDecision.BONA_FIDE)
    
    fusion = fuse_predictions(identity_verified=is_identity_match, pad_passed=is_pad_pass)

    return VerificationResponse(
        request_id="mock-req-12345",
        claimed_subject_id=claimed_subject_id,
        acquisition_status=AcquisitionStatus.OK,
        identity=IdentityResult(
            decision=identity_decision,
            score=score
        ),
        pad=PadResult(
            decision=pad_decision
        ),
        final_decision=FinalDecision.ACCEPT if fusion.final_decision else FinalDecision.REJECT,
        reasons=list(fusion.reasons)
    )
