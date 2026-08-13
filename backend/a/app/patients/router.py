from fastapi import APIRouter, Depends

from ..database import get_db
from ..dependencies import current_identity
from ..authorization import require_role
from ..models import UserRole
from .schemas import PatientCreateRequest, PatientUpdateRequest
from .service import PatientService
from ..api_responses import success


router = APIRouter(prefix="/api/v1/patients", tags=["patients"])


def service(db=Depends(get_db)) -> PatientService:
    return PatientService(db)


@router.post("", status_code=201)
def create_patient(
    body: PatientCreateRequest,
    identity: tuple[str, UserRole] = Depends(current_identity),
    patient_service: PatientService = Depends(service),
):
    actor_id = require_role(
        identity,
        UserRole.GUARDIAN,
        "GUARDIAN_ROLE_REQUIRED",
        "보호자만 환자를 등록할 수 있습니다.",
    )
    return success(patient_service.create(actor_id, body), 201)


@router.get("/{patient_id}")
def get_patient(
    patient_id: str,
    identity: tuple[str, UserRole] = Depends(current_identity),
    patient_service: PatientService = Depends(service),
):
    return success(patient_service.get(*identity, patient_id))


@router.put("/{patient_id}")
def update_patient(
    patient_id: str,
    body: PatientUpdateRequest,
    identity: tuple[str, UserRole] = Depends(current_identity),
    patient_service: PatientService = Depends(service),
):
    actor_id = require_role(
        identity,
        UserRole.GUARDIAN,
        "GUARDIAN_ROLE_REQUIRED",
        "보호자만 환자 정보를 수정할 수 있습니다.",
    )
    return success(patient_service.update(actor_id, patient_id, body))
