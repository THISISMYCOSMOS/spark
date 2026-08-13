from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..errors import ConflictError, ForbiddenError, NotFoundError
from ..models import (
    GuardianPatient, ImpactCase, OperationMode, PushDeliveryStatus, PushDevice,
    PushNotificationDelivery, OutageStatus, UserRole,
)
from .provider import ExpoPushProvider, MockPushProvider
from .schemas import PushDeviceRegisterRequest, PushNotificationSendRequest
from .templates import DISASTER_PUSH_TEMPLATES


class PushService:
    def __init__(self, db: Session):
        self.db = db

    def register_device(self, owner_id: str, owner_role: UserRole, body: PushDeviceRegisterRequest) -> dict:
        if owner_role not in {UserRole.PATIENT, UserRole.GUARDIAN}:
            raise ForbiddenError("PUSH_DEVICE_ROLE_NOT_ALLOWED", "환자 또는 보호자만 푸시 기기를 등록할 수 있습니다.")
        device = self.db.scalar(select(PushDevice).where(PushDevice.token == body.token))
        if device is None:
            device = PushDevice(owner_id=owner_id, owner_role=owner_role, token=body.token, platform=body.platform)
            self.db.add(device)
        else:
            device.owner_id, device.owner_role = owner_id, owner_role
            device.platform, device.is_active = body.platform, True
        self.db.commit()
        return self._device_view(device)

    def deactivate_device(self, owner_id: str, owner_role: UserRole, device_id: str) -> dict:
        device = self.db.get(PushDevice, device_id)
        if device is None or device.owner_id != owner_id or device.owner_role != owner_role:
            raise NotFoundError("PUSH_DEVICE_NOT_FOUND", "푸시 기기를 찾을 수 없습니다.")
        device.is_active = False
        self.db.commit()
        return self._device_view(device)

    def send(self, case_id: str, body: PushNotificationSendRequest) -> dict:
        case = self.db.get(ImpactCase, case_id)
        if case is None:
            raise NotFoundError("IMPACT_CASE_NOT_FOUND", "환자 대응 건을 찾을 수 없습니다.")
        if case.outage.status != OutageStatus.ACTIVE:
            raise ConflictError("PUSH_OUTAGE_NOT_ACTIVE", "발생 중인 재난에 대해서만 앱 푸시를 발송할 수 있습니다.")
        self._validate_recipient(case, body.recipient_id, body.recipient_role)
        template = DISASTER_PUSH_TEMPLATES.get(case.outage.disaster_type)
        if template is None:
            raise ConflictError("PUSH_TEMPLATE_NOT_SUPPORTED", "해당 재난 유형의 앱 푸시 문구가 설정되지 않았습니다.")
        existing = self.db.scalar(select(PushNotificationDelivery).where(
            PushNotificationDelivery.impact_case_id == case_id,
            PushNotificationDelivery.notification_type == body.notification_type,
            PushNotificationDelivery.recipient_id == body.recipient_id,
            PushNotificationDelivery.escalation_round == body.escalation_round,
        ))
        if existing is not None:
            return {**self._delivery_view(existing), "duplicate": True}
        devices = list(self.db.scalars(select(PushDevice).where(
            PushDevice.owner_id == body.recipient_id,
            PushDevice.owner_role == body.recipient_role,
            PushDevice.is_active.is_(True),
        )))
        if not devices:
            raise ConflictError("PUSH_DEVICE_NOT_REGISTERED", "활성 푸시 기기가 등록되지 않았습니다.")
        title, message = template
        provider = MockPushProvider() if case.outage.mode == OperationMode.TEST else ExpoPushProvider()
        delivery = PushNotificationDelivery(
            outage_id=case.outage_id, impact_case_id=case.id,
            notification_type=body.notification_type, recipient_id=body.recipient_id,
            recipient_role=body.recipient_role, escalation_round=body.escalation_round,
            mode=case.outage.mode, disaster_type=case.outage.disaster_type,
            title=title, body=message, provider=provider.name, status=PushDeliveryStatus.PENDING,
        )
        self.db.add(delivery)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ConflictError("PUSH_NOTIFICATION_CONFLICT", "동일한 푸시 알림이 이미 처리 중입니다.") from exc
        result = provider.send(
            [device.token for device in devices], title, message,
            {"outageId": case.outage_id, "caseId": case.id, "disasterType": case.outage.disaster_type.value},
        )
        delivery.provider_message_ids = result.message_ids
        delivery.status = PushDeliveryStatus.ACCEPTED if result.accepted else PushDeliveryStatus.FAILED
        delivery.last_error = result.error
        delivery.provider_accepted_at = datetime.now(timezone.utc) if result.accepted else None
        self.db.commit()
        return {**self._delivery_view(delivery), "duplicate": False}

    def get_delivery(self, delivery_id: str) -> dict:
        delivery = self.db.get(PushNotificationDelivery, delivery_id)
        if delivery is None:
            raise NotFoundError("PUSH_NOTIFICATION_NOT_FOUND", "푸시 알림 기록을 찾을 수 없습니다.")
        return self._delivery_view(delivery)

    def _validate_recipient(self, case: ImpactCase, recipient_id: str, role: UserRole) -> None:
        allowed = role == UserRole.PATIENT and recipient_id == case.patient_id
        if role == UserRole.GUARDIAN:
            allowed = self.db.scalar(select(GuardianPatient.id).where(
                GuardianPatient.guardian_id == recipient_id,
                GuardianPatient.patient_id == case.patient_id,
            )) is not None
        if not allowed:
            raise ConflictError("PUSH_RECIPIENT_NOT_LINKED", "대응 건과 연결된 환자 또는 보호자만 알림을 받을 수 있습니다.")

    @staticmethod
    def _device_view(device: PushDevice) -> dict:
        return {"id": device.id, "platform": device.platform.value, "provider": device.provider, "isActive": device.is_active}

    @staticmethod
    def _delivery_view(delivery: PushNotificationDelivery) -> dict:
        return {
            "id": delivery.id, "outageId": delivery.outage_id, "caseId": delivery.impact_case_id,
            "notificationType": delivery.notification_type.value, "recipientId": delivery.recipient_id,
            "recipientRole": delivery.recipient_role.value, "escalationRound": delivery.escalation_round,
            "mode": delivery.mode.value, "disasterType": delivery.disaster_type.value,
            "title": delivery.title, "body": delivery.body, "provider": delivery.provider,
            "status": delivery.status.value, "providerMessageIds": delivery.provider_message_ids,
            "lastError": delivery.last_error,
            "requestedAt": delivery.requested_at.isoformat(),
            "providerAcceptedAt": delivery.provider_accepted_at.isoformat() if delivery.provider_accepted_at else None,
        }
