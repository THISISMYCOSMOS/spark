from fastapi import APIRouter, Depends, Header

from ..database import get_db
from ..dependencies import current_identity
from ..authorization import require_any_role, require_role
from ..models import UserRole
from ..idempotency import execute_idempotent
from .schemas import ImpactCaseCreateRequest, ImpactCaseTransitionRequest, OutageCreateRequest, OutageUpdateRequest, RiskResultRequest, StateChangeRequest
from .service import OutageService
from ..api_responses import success


router = APIRouter(tags=["outages"])


def service(db=Depends(get_db)) -> OutageService:
    return OutageService(db)


@router.post("/api/v1/outages", status_code=201)
def create_outage(body: OutageCreateRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.INSTITUTION_ADMIN)
    return success(execute_idempotent(svc.db, actor, "POST:/outages", idempotency_key, body, lambda: svc.create(actor, body)), 201)


@router.get("/api/v1/outages/{outage_id}")
def get_outage(outage_id: str, identity=Depends(current_identity), svc=Depends(service)):
    require_role(identity, UserRole.INSTITUTION_ADMIN)
    return success(svc.get(outage_id))


@router.put("/api/v1/outages/{outage_id}")
def update_outage(outage_id: str, body: OutageUpdateRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.INSTITUTION_ADMIN)
    return success(execute_idempotent(svc.db, actor, f"PUT:/outages/{outage_id}", idempotency_key, body, lambda: svc.update(actor, outage_id, body)))


@router.post("/api/v1/outages/{outage_id}/activate")
def activate(outage_id: str, body: StateChangeRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.INSTITUTION_ADMIN)
    return success(execute_idempotent(svc.db, actor, f"POST:/outages/{outage_id}/activate", idempotency_key, body, lambda: svc.activate(actor, outage_id, body)))


@router.post("/api/v1/outages/{outage_id}/cancel")
def cancel(outage_id: str, body: StateChangeRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.INSTITUTION_ADMIN)
    return success(execute_idempotent(svc.db, actor, f"POST:/outages/{outage_id}/cancel", idempotency_key, body, lambda: svc.cancel(actor, outage_id, body)))


@router.post("/api/v1/outages/{outage_id}/impact-cases", status_code=201)
def create_case(outage_id: str, body: ImpactCaseCreateRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.CORE_ENGINE)
    return success(execute_idempotent(svc.db, actor, f"POST:/outages/{outage_id}/impact-cases", idempotency_key, body, lambda: svc.create_case(actor, outage_id, body)), 201)


@router.get("/api/v1/outages/{outage_id}/impact-cases")
def list_cases(outage_id: str, identity=Depends(current_identity), svc=Depends(service)):
    require_role(identity, UserRole.INSTITUTION_ADMIN)
    return success(svc.list_cases(outage_id))


@router.get("/api/v1/impact-cases/{case_id}")
def get_case(case_id: str, identity=Depends(current_identity), svc=Depends(service)):
    require_any_role(identity, {UserRole.INSTITUTION_ADMIN, UserRole.CORE_ENGINE})
    return success(svc.get_case(case_id))


@router.post("/api/v1/impact-cases/{case_id}/transitions")
def transition_case(case_id: str, body: ImpactCaseTransitionRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.CORE_ENGINE)
    return success(execute_idempotent(svc.db, actor, f"POST:/impact-cases/{case_id}/transitions", idempotency_key, body, lambda: svc.transition_case(actor, case_id, body)))


@router.post("/api/v1/impact-cases/{case_id}/risk-results")
def save_risk(case_id: str, body: RiskResultRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.CORE_ENGINE)
    return success(execute_idempotent(svc.db, actor, f"POST:/impact-cases/{case_id}/risk-results", idempotency_key, body, lambda: svc.save_risk_result(actor, case_id, body)))
