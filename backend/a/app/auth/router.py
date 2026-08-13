from fastapi import APIRouter, Depends

from ..dependencies import current_identity, get_auth_service
from ..models import UserRole
from ..api_responses import success
from .schemas import GuardianLoginRequest, GuardianSignupRequest, PatientLoginRequest
from .service import AuthService


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/guardians/signup", status_code=201)
def guardian_signup(body: GuardianSignupRequest, service: AuthService = Depends(get_auth_service)):
    return success(service.signup_guardian(body), status_code=201)


@router.post("/guardians/login")
def guardian_login(body: GuardianLoginRequest, service: AuthService = Depends(get_auth_service)):
    return success(service.login_guardian(body))


@router.post("/patients/login")
def patient_login(body: PatientLoginRequest, service: AuthService = Depends(get_auth_service)):
    return success(service.login_patient(body))


@router.get("/me")
def get_me(
    identity: tuple[str, UserRole] = Depends(current_identity),
    service: AuthService = Depends(get_auth_service),
):
    return success(service.get_me(*identity))
