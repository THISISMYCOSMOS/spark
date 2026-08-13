from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..errors import ConflictError, ForbiddenError, GoneError, NotFoundError
from ..models import (
    AuditAction, AuditLog, EmergencyContact, GuardianAction, ImpactCase, ImpactCaseStatus,
    OutageEvent, OutageEventHistory, OutageStatus, PatientResponse, RecoveryConfirmation,
    StatusCheck, StatusCheckPurpose, StatusCheckStatus, UserRole,
)
from ..outages.presenters import impact_case_view, outage_view
from ..audit_repository import AuditLogRepository
from ..security import digest_response_token
from ..patients.repositories import GuardianPatientRepository
from .schemas import GuardianActionRequest, PatientStatusResponseRequest, PublicCheckInResponse, RecoveryConfirmationRequest, RegionalRecoveryRequest, StatusCheckRegisterRequest, TimeoutRequest


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class ResponseService:
    def __init__(self, db: Session):
        self.db = db
        self.audits = AuditLogRepository(db)
        self.links = GuardianPatientRepository(db)

    def register_check(self, actor_id: str, case_id: str, body: StatusCheckRegisterRequest) -> dict:
        case = self._case(case_id)
        if case.status == ImpactCaseStatus.CLOSED:
            raise ConflictError("IMPACT_CASE_CLOSED", "종료된 대응 건에는 상태 확인을 생성할 수 없습니다.")
        if self.db.get(StatusCheck, body.id) is not None:
            raise ConflictError("STATUS_CHECK_ID_ALREADY_EXISTS", "동일한 상태 확인 ID가 이미 존재합니다.")
        if body.purpose == StatusCheckPurpose.RECOVERY_CONFIRMATION and case.status != ImpactCaseStatus.RECOVERY_CHECK:
            raise ConflictError("INVALID_CHECK_PURPOSE", "복구 확인은 RECOVERY_CHECK 상태에서만 생성할 수 있습니다.")
        check = StatusCheck(
            id=body.id, impact_case_id=case_id, purpose=body.purpose, token_digest=digest_response_token(body.token),
            requested_at=body.requested_at, provider_accepted_at=body.provider_accepted_at,
            response_due_at=body.response_due_at, token_expires_at=body.token_expires_at,
            status=StatusCheckStatus.PENDING,
        )
        self.db.add(check)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ConflictError("STATUS_CHECK_CREATE_CONFLICT", "상태 확인 ID 또는 토큰이 중복되었습니다.") from exc
        self._audit("StatusCheck", check.id, AuditAction.CREATED, actor_id, UserRole.CORE_ENGINE, "공급자 접수 완료 후 상태 확인 등록", None, self._check_view(check))
        self._commit("STATUS_CHECK_CREATE_CONFLICT", "상태 확인 또는 토큰이 중복되었습니다.")
        return self._check_view(check)

    def timeout(self, actor_id: str, check_id: str, body: TimeoutRequest) -> dict:
        check = self._check(check_id)
        self._version(check.version, body.version)
        if check.status != StatusCheckStatus.PENDING:
            raise ConflictError("STATUS_CHECK_NOT_PENDING", "대기 중인 상태 확인만 시간 초과 처리할 수 있습니다.")
        before = self._check_view(check)
        check.status, check.timed_out_at, check.version = StatusCheckStatus.TIMED_OUT, body.timed_out_at, check.version + 1
        self._audit("StatusCheck", check.id, AuditAction.STATE_CHANGED, actor_id, UserRole.CORE_ENGINE, body.reason, before, self._check_view(check))
        self._commit("STATUS_CHECK_UPDATE_CONFLICT", "상태 확인 변경이 충돌했습니다.")
        return self._check_view(check)

    def public_response(self, token: str, body: PublicCheckInResponse) -> dict:
        check = self.db.scalar(select(StatusCheck).where(StatusCheck.token_digest == digest_response_token(token)))
        if check is None:
            raise NotFoundError("CHECK_IN_TOKEN_INVALID", "응답 토큰이 유효하지 않습니다.")
        if check.status != StatusCheckStatus.PENDING:
            raise GoneError("CHECK_IN_TOKEN_ALREADY_USED", "이미 사용되었거나 종료된 응답 토큰입니다.")
        now = datetime.now(timezone.utc)
        check_before = self._check_view(check)
        if now > as_utc(check.token_expires_at):
            raise GoneError("CHECK_IN_TOKEN_EXPIRED", "응답 토큰의 유효 시간이 만료되었습니다.")
        case = self._case(check.impact_case_id)
        if check.purpose == StatusCheckPurpose.OUTAGE_STATUS:
            if body.response_type is None or body.home_power_restored is not None or body.device_operating_normally is not None:
                raise ConflictError("RESPONSE_BODY_MISMATCH", "정전 상태 확인에는 responseType이 필요합니다.")
            response = PatientResponse(status_check_id=check.id, response_type=body.response_type, note=body.note, responded_at=now)
            self.db.add(response)
            result = {"statusCheckId": check.id, "purpose": check.purpose.value, "responseType": body.response_type.value, "acceptedAt": now.isoformat()}
        else:
            if body.home_power_restored is None or body.device_operating_normally is None or body.response_type is not None:
                raise ConflictError("RESPONSE_BODY_MISMATCH", "복구 확인에는 가정 전력과 기기 작동 결과가 필요합니다.")
            confirmation = RecoveryConfirmation(
                impact_case_id=case.id, status_check_id=check.id,
                home_power_restored=body.home_power_restored,
                device_operating_normally=body.device_operating_normally,
                confirmed_by_id=case.patient_id, confirmed_by_role=UserRole.PATIENT,
                reason=body.note or "환자 공개 복구 응답", confirmed_at=now,
            )
            self.db.add(confirmation)
            result = {"statusCheckId": check.id, "purpose": check.purpose.value, "homePowerRestored": body.home_power_restored, "deviceOperatingNormally": body.device_operating_normally, "caseClosed": False, "decisionPending": True, "acceptedAt": now.isoformat()}
        check.status, check.responded_at, check.version = StatusCheckStatus.RESPONDED, now, check.version + 1
        self._audit("StatusCheck", check.id, AuditAction.STATE_CHANGED, case.patient_id, UserRole.PATIENT, "환자 공개 응답", check_before, self._check_view(check))
        self._commit("CHECK_IN_RESPONSE_CONFLICT", "응답이 동시에 처리되었습니다.")
        return result

    def patient_response(self, patient_id: str, case_id: str, body: PatientStatusResponseRequest) -> dict:
        case = self._case(case_id)
        if case.patient_id != patient_id:
            raise ForbiddenError("PATIENT_ACCESS_DENIED", "본인의 재난 대응 상황에만 응답할 수 있습니다.")
        check = self.db.scalar(
            select(StatusCheck)
            .where(
                StatusCheck.impact_case_id == case_id,
                StatusCheck.purpose == StatusCheckPurpose.OUTAGE_STATUS,
                StatusCheck.status == StatusCheckStatus.PENDING,
            )
            .order_by(StatusCheck.requested_at.desc())
            .limit(1)
        )
        if check is None:
            raise NotFoundError("PENDING_STATUS_CHECK_NOT_FOUND", "응답을 기다리는 상태 확인이 없습니다.")
        now = datetime.now(timezone.utc)
        if now > as_utc(check.token_expires_at):
            raise GoneError("STATUS_CHECK_EXPIRED", "상태 확인 응답 시간이 만료되었습니다.")
        before = self._check_view(check)
        response = PatientResponse(
            status_check_id=check.id,
            response_type=body.response_type,
            note=body.note,
            responded_at=now,
        )
        self.db.add(response)
        check.status, check.responded_at, check.version = StatusCheckStatus.RESPONDED, now, check.version + 1
        result = {
            "statusCheckId": check.id,
            "purpose": check.purpose.value,
            "responseType": body.response_type.value,
            "acceptedAt": now.isoformat(),
        }
        self._audit("StatusCheck", check.id, AuditAction.STATE_CHANGED, patient_id, UserRole.PATIENT, "로그인 환자 상태 응답", before, self._check_view(check))
        self._commit("CHECK_IN_RESPONSE_CONFLICT", "응답이 동시에 처리되었습니다.")
        return result

    def guardian_action(self, actor_id: str, role: UserRole, case_id: str, body: GuardianActionRequest) -> dict:
        case = self._case(case_id)
        contact = self.db.get(EmergencyContact, body.emergency_contact_id)
        if contact is None or contact.patient_id != case.patient_id:
            raise NotFoundError("EMERGENCY_CONTACT_NOT_FOUND", "대응 건 환자의 보호자 연락처를 찾을 수 없습니다.")
        if role == UserRole.GUARDIAN and not self.links.exists(actor_id, case.patient_id):
            raise ForbiddenError("GUARDIAN_ACCESS_DENIED", "해당 환자의 보호자가 아닙니다.")
        if role not in {UserRole.GUARDIAN, UserRole.INSTITUTION_ADMIN}:
            raise ForbiddenError("ROLE_REQUIRED", "보호자 또는 기관 관리자 역할이 필요합니다.")
        action = GuardianAction(
            impact_case_id=case.id, emergency_contact_id=contact.id,
            guardian_id=actor_id if role == UserRole.GUARDIAN else contact.guardian_id,
            status=body.status, escalation_round=body.escalation_round, note=body.note, acted_at=body.acted_at,
        )
        self.db.add(action)
        self.db.flush()
        view = self._action_view(action)
        self._audit("GuardianAction", action.id, AuditAction.CREATED, actor_id, role, body.note or body.status.value, None, view)
        self._commit("GUARDIAN_ACTION_CONFLICT", "동일 보호자 대응 기록이 이미 존재합니다.")
        return view

    def manual_recovery(self, actor_id: str, role: UserRole, case_id: str, body: RecoveryConfirmationRequest) -> dict:
        case = self._case(case_id)
        if role == UserRole.GUARDIAN and not self.links.exists(actor_id, case.patient_id):
            raise ForbiddenError("GUARDIAN_ACCESS_DENIED", "해당 환자의 보호자가 아닙니다.")
        if role not in {UserRole.GUARDIAN, UserRole.INSTITUTION_ADMIN}:
            raise ForbiddenError("ROLE_REQUIRED", "보호자 또는 기관 관리자 역할이 필요합니다.")
        if case.status != ImpactCaseStatus.RECOVERY_CHECK:
            raise ConflictError("RECOVERY_CONFIRMATION_NOT_ALLOWED", "RECOVERY_CHECK 상태에서만 복구 확인을 저장할 수 있습니다.")
        confirmation = RecoveryConfirmation(
            impact_case_id=case.id, home_power_restored=body.home_power_restored,
            device_operating_normally=body.device_operating_normally,
            confirmed_by_id=actor_id, confirmed_by_role=role, reason=body.reason,
        )
        self.db.add(confirmation)
        self.db.flush()
        result = self._recovery_view(confirmation) | {"caseClosed": False, "decisionPending": True}
        self._audit("RecoveryConfirmation", confirmation.id, AuditAction.CREATED, actor_id, role, body.reason, None, result)
        self._commit("RECOVERY_CONFIRMATION_CONFLICT", "복구 확인 저장이 충돌했습니다.")
        return result

    def regional_recovery(self, actor_id: str, outage_id: str, body: RegionalRecoveryRequest) -> dict:
        outage = self.db.get(OutageEvent, outage_id)
        if outage is None: raise NotFoundError("OUTAGE_NOT_FOUND", "정전을 찾을 수 없습니다.")
        self._version(outage.version, body.version)
        if outage.status != OutageStatus.ACTIVE:
            raise ConflictError("INVALID_STATE_TRANSITION", "ACTIVE 정전만 지역 복구 등록할 수 있습니다.")
        before = outage_view(outage)
        outage.status, outage.recovery_reported_at, outage.recovery_source = OutageStatus.RECOVERY_REPORTED, body.recovered_at, body.source
        outage.version += 1
        self.db.add(OutageEventHistory(outage_id=outage.id, previous_status=OutageStatus.ACTIVE, next_status=OutageStatus.RECOVERY_REPORTED, actor_id=actor_id, actor_role=UserRole.INSTITUTION_ADMIN, reason=body.reason, occurred_at=body.recovered_at))
        self._audit("OutageEvent", outage.id, AuditAction.STATE_CHANGED, actor_id, UserRole.INSTITUTION_ADMIN, body.reason, before, outage_view(outage))
        self._commit("OUTAGE_RECOVERY_CONFLICT", "지역 복구 등록이 충돌했습니다.")
        return outage_view(outage) | {"recoveryDecisionPending": True}

    def _case(self, case_id):
        value = self.db.get(ImpactCase, case_id)
        if value is None: raise NotFoundError("IMPACT_CASE_NOT_FOUND", "환자 대응 건을 찾을 수 없습니다.")
        return value
    def _check(self, check_id):
        value = self.db.get(StatusCheck, check_id)
        if value is None: raise NotFoundError("STATUS_CHECK_NOT_FOUND", "상태 확인을 찾을 수 없습니다.")
        return value
    @staticmethod
    def _version(current, requested):
        if current != requested: raise ConflictError("OPTIMISTIC_LOCK_CONFLICT", "다른 요청에서 먼저 변경되었습니다.")
    def _audit(self, entity_type, entity_id, action, actor_id, role, reason, before, after):
        self.audits.add(AuditLog(entity_type=entity_type, entity_id=entity_id, action=action, actor_id=actor_id, actor_role=role, reason=reason, before_values=before, after_values=after))
    def _commit(self, code, message):
        try: self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise ConflictError(code, message) from exc
    @staticmethod
    def _check_view(value):
        return {"id": value.id, "impactCaseId": value.impact_case_id, "purpose": value.purpose.value, "status": value.status.value, "requestedAt": value.requested_at.isoformat(), "providerAcceptedAt": value.provider_accepted_at.isoformat(), "responseDueAt": value.response_due_at.isoformat(), "tokenExpiresAt": value.token_expires_at.isoformat(), "respondedAt": value.responded_at.isoformat() if value.responded_at else None, "timedOutAt": value.timed_out_at.isoformat() if value.timed_out_at else None, "version": value.version}
    @staticmethod
    def _action_view(value):
        return {"id": value.id, "impactCaseId": value.impact_case_id, "emergencyContactId": value.emergency_contact_id, "guardianId": value.guardian_id, "status": value.status.value, "escalationRound": value.escalation_round, "note": value.note, "actedAt": value.acted_at.isoformat()}
    @staticmethod
    def _recovery_view(value):
        return {"id": value.id, "impactCaseId": value.impact_case_id, "homePowerRestored": value.home_power_restored, "deviceOperatingNormally": value.device_operating_normally, "confirmedById": value.confirmed_by_id, "confirmedByRole": value.confirmed_by_role.value, "reason": value.reason, "confirmedAt": value.confirmed_at.isoformat()}
