from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import verify

app = FastAPI(
    title="Biometric Verification API",
    description="API for face verification and PAD (liveness)",
    version="1.0.0"
)

# Allow CORS for Laravel app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(verify.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "ok"}
