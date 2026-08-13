from fastapi import APIRouter, Depends, Header

from ..api_responses import success
from ..authorization import require_role
from ..database import get_db
from ..dependencies import current_identity
from ..idempotency import execute_idempotent
from ..models import UserRole
from .schemas import PushDeviceRegisterRequest, PushNotificationSendRequest
from .service import PushService


router = APIRouter(tags=["push-notifications"])


def service(db=Depends(get_db)) -> PushService:
    return PushService(db)


@router.post("/api/v1/push/devices", status_code=201)
def register_device(body: PushDeviceRegisterRequest, identity=Depends(current_identity), svc=Depends(service)):
    return success(svc.register_device(*identity, body), 201)


@router.delete("/api/v1/push/devices/{device_id}")
def deactivate_device(device_id: str, identity=Depends(current_identity), svc=Depends(service)):
    return success(svc.deactivate_device(*identity, device_id))


@router.post("/api/v1/core/impact-cases/{case_id}/push-notifications", status_code=201)
def send_push(case_id: str, body: PushNotificationSendRequest, identity=Depends(current_identity), svc=Depends(service), idempotency_key: str = Header(min_length=8, max_length=100)):
    actor = require_role(identity, UserRole.CORE_ENGINE)
    result = execute_idempotent(svc.db, actor, f"POST:/impact-cases/{case_id}/push-notifications", idempotency_key, body, lambda: svc.send(case_id, body))
    return success(result, 201)


@router.get("/api/v1/push-notifications/{delivery_id}")
def get_push(delivery_id: str, identity=Depends(current_identity), svc=Depends(service)):
    require_role(identity, UserRole.CORE_ENGINE)
    return success(svc.get_delivery(delivery_id))
