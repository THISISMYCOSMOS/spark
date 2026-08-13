from fastapi import APIRouter, Depends, Header

from ..database import get_db
from ..dependencies import current_identity
from ..authorization import require_role
from ..idempotency import execute_idempotent
from ..models import UserRole
from .schemas import GuardianActionRequest, PatientStatusResponseRequest, PublicCheckInResponse, RecoveryConfirmationRequest, RegionalRecoveryRequest, StatusCheckRegisterRequest, TimeoutRequest
from .service import ResponseService
from ..api_responses import success


router = APIRouter(tags=["responses", "recovery"])


def service(db=Depends(get_db)) -> ResponseService:
    return ResponseService(db)


@router.post("/api/v1/impact-cases/{case_id}/status-checks", status_code=201)
def register_check(case_id: str, body: StatusCheckRegisterRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.CORE_ENGINE)
    return success(execute_idempotent(svc.db, actor, f"POST:/impact-cases/{case_id}/status-checks", idempotency_key, body, lambda: svc.register_check(actor, case_id, body)), 201)


@router.post("/api/v1/status-checks/{check_id}/timeout")
def timeout(check_id: str, body: TimeoutRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.CORE_ENGINE)
    return success(execute_idempotent(svc.db, actor, f"POST:/status-checks/{check_id}/timeout", idempotency_key, body, lambda: svc.timeout(actor, check_id, body)))


@router.post("/api/v1/public/check-ins/{token}/responses")
def public_response(token: str, body: PublicCheckInResponse, svc=Depends(service)):
    return success(svc.public_response(token, body))


@router.post("/api/v1/impact-cases/{case_id}/patient-responses", status_code=201)
def patient_response(case_id: str, body: PatientStatusResponseRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    patient_id = require_role(identity, UserRole.PATIENT)
    return success(execute_idempotent(svc.db, patient_id, f"POST:/impact-cases/{case_id}/patient-responses", idempotency_key, body, lambda: svc.patient_response(patient_id, case_id, body)), 201)


@router.post("/api/v1/impact-cases/{case_id}/guardian-actions", status_code=201)
def guardian_action(case_id: str, body: GuardianActionRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor, role = identity
    return success(execute_idempotent(svc.db, actor, f"POST:/impact-cases/{case_id}/guardian-actions", idempotency_key, body, lambda: svc.guardian_action(actor, role, case_id, body)), 201)


@router.post("/api/v1/outages/{outage_id}/recovery")
def regional_recovery(outage_id: str, body: RegionalRecoveryRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.INSTITUTION_ADMIN)
    return success(execute_idempotent(svc.db, actor, f"POST:/outages/{outage_id}/recovery", idempotency_key, body, lambda: svc.regional_recovery(actor, outage_id, body)))


@router.post("/api/v1/core/outages/{outage_id}/recovery")
def core_regional_recovery(outage_id: str, body: RegionalRecoveryRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.CORE_ENGINE)
    return success(execute_idempotent(svc.db, actor, f"POST:/core/outages/{outage_id}/recovery", idempotency_key, body, lambda: svc.regional_recovery(actor, outage_id, body, UserRole.CORE_ENGINE)))


@router.post("/api/v1/impact-cases/{case_id}/recovery-confirmations", status_code=201)
def recovery_confirmation(case_id: str, body: RecoveryConfirmationRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor, role = identity
    return success(execute_idempotent(svc.db, actor, f"POST:/impact-cases/{case_id}/recovery-confirmations", idempotency_key, body, lambda: svc.manual_recovery(actor, role, case_id, body)), 201)
