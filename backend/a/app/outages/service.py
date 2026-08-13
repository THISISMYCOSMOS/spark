from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..errors import ConflictError, NotFoundError
from ..models import (
    AuditAction, AuditLog, ImpactCase, ImpactCaseStatus, OutageEvent, OutageEventHistory,
    OutageStatus, OutageType, UserRole,
)
from ..audit_repository import AuditLogRepository
from .presenters import impact_case_view, outage_view
from .repositories import ImpactCaseRepository, OutageRepository, PatientExistenceRepository, RiskPolicyRepository
from .schemas import ImpactCaseCreateRequest, ImpactCaseTransitionRequest, OutageCreateRequest, OutageUpdateRequest, RiskResultRequest, StateChangeRequest


CASE_TRANSITIONS = {
    ImpactCaseStatus.PREPARE: {ImpactCaseStatus.WAITING_PATIENT, ImpactCaseStatus.ACTION_REQUIRED, ImpactCaseStatus.RECOVERY_CHECK},
    ImpactCaseStatus.WAITING_PATIENT: {ImpactCaseStatus.MONITORING, ImpactCaseStatus.ACTION_REQUIRED, ImpactCaseStatus.RECOVERY_CHECK},
    ImpactCaseStatus.MONITORING: {ImpactCaseStatus.WAITING_PATIENT, ImpactCaseStatus.ACTION_REQUIRED, ImpactCaseStatus.RECOVERY_CHECK},
    ImpactCaseStatus.ACTION_REQUIRED: {ImpactCaseStatus.GUARDIAN_ACTING, ImpactCaseStatus.RECOVERY_CHECK},
    ImpactCaseStatus.GUARDIAN_ACTING: {ImpactCaseStatus.MONITORING, ImpactCaseStatus.ACTION_REQUIRED, ImpactCaseStatus.RECOVERY_CHECK},
    ImpactCaseStatus.RECOVERY_CHECK: {ImpactCaseStatus.ACTION_REQUIRED, ImpactCaseStatus.GUARDIAN_ACTING},
    ImpactCaseStatus.CLOSED: set(),
}


class OutageService:
    def __init__(self, db: Session):
        self.db = db
        self.outages = OutageRepository(db)
        self.cases = ImpactCaseRepository(db)
        self.policies = RiskPolicyRepository(db)
        self.patients = PatientExistenceRepository(db)
        self.audits = AuditLogRepository(db)

    def create(self, actor_id: str, body: OutageCreateRequest) -> dict:
        now = datetime.now(timezone.utc)
        status = OutageStatus.SCHEDULED if body.outage_type == OutageType.SCHEDULED else OutageStatus.ACTIVE
        outage = OutageEvent(
            title=body.title, outage_type=body.outage_type, mode=body.mode, status=status,
            region_codes=body.region_codes, scheduled_start_at=body.scheduled_start_at,
            expected_end_at=body.expected_end_at,
            started_at=(body.started_at or now) if status == OutageStatus.ACTIVE else None,
            source=body.source, description=body.description, created_by=actor_id,
        )
        self.outages.add(outage)
        self.db.flush()
        self._history(outage, None, status, actor_id, UserRole.INSTITUTION_ADMIN, body.reason)
        self._audit(outage, AuditAction.CREATED, actor_id, UserRole.INSTITUTION_ADMIN, body.reason, None, outage_view(outage))
        self._commit("OUTAGE_CREATE_CONFLICT", "정전 등록이 충돌했습니다.")
        return outage_view(outage)

    def get(self, outage_id: str) -> dict:
        return outage_view(self._outage(outage_id))

    def update(self, actor_id: str, outage_id: str, body: OutageUpdateRequest) -> dict:
        outage = self._outage(outage_id)
        if outage.status != OutageStatus.SCHEDULED:
            raise ConflictError("INVALID_STATE_TRANSITION", "예고 상태의 정전만 수정할 수 있습니다.")
        self._version(outage.version, body.version)
        before = outage_view(outage)
        outage.title, outage.region_codes = body.title, body.region_codes
        outage.scheduled_start_at, outage.expected_end_at = body.scheduled_start_at, body.expected_end_at
        outage.source, outage.description = body.source, body.description
        outage.version += 1
        self._audit(outage, AuditAction.UPDATED, actor_id, UserRole.INSTITUTION_ADMIN, body.reason, before, outage_view(outage))
        self._commit("OUTAGE_UPDATE_CONFLICT", "정전 수정이 충돌했습니다.")
        return outage_view(outage)

    def activate(self, actor_id: str, outage_id: str, body: StateChangeRequest) -> dict:
        outage = self._outage(outage_id)
        if outage.status != OutageStatus.SCHEDULED:
            raise ConflictError("INVALID_STATE_TRANSITION", "SCHEDULED 정전만 시작할 수 있습니다.")
        self._version(outage.version, body.version)
        return self._change_outage_status(outage, OutageStatus.ACTIVE, actor_id, body.reason, body.occurred_at)

    def cancel(self, actor_id: str, outage_id: str, body: StateChangeRequest) -> dict:
        outage = self._outage(outage_id)
        if outage.status != OutageStatus.SCHEDULED:
            raise ConflictError("INVALID_STATE_TRANSITION", "시작 전 SCHEDULED 정전만 취소할 수 있습니다.")
        self._version(outage.version, body.version)
        return self._change_outage_status(outage, OutageStatus.CANCELLED, actor_id, body.reason, body.occurred_at)

    def create_case(self, actor_id: str, outage_id: str, body: ImpactCaseCreateRequest) -> dict:
        outage = self._outage(outage_id)
        if outage.status not in {OutageStatus.SCHEDULED, OutageStatus.ACTIVE}:
            raise ConflictError("INVALID_OUTAGE_STATE", "현재 정전 상태에서는 대응 건을 생성할 수 없습니다.")
        if self.cases.exists(outage_id, body.patient_id):
            raise ConflictError("IMPACT_CASE_ALREADY_EXISTS", "동일 정전과 환자의 대응 건이 이미 존재합니다.")
        if not self.patients.active_exists(body.patient_id):
            raise NotFoundError("PATIENT_NOT_FOUND", "환자를 찾을 수 없습니다.")
        policy = self.policies.find(body.risk_policy_id)
        if policy is None or not policy.is_active or policy.version != body.risk_policy_version:
            raise ConflictError("RISK_POLICY_VERSION_MISMATCH", "위험 정책과 버전이 일치하지 않습니다.")
        if outage.mode.value == "LIVE" and policy.is_demo_only:
            raise ConflictError("DEMO_POLICY_NOT_ALLOWED_IN_LIVE", "DEMO_ONLY 위험 정책은 LIVE 정전에 사용할 수 없습니다.")
        if outage.status == OutageStatus.SCHEDULED and body.status != ImpactCaseStatus.PREPARE:
            raise ConflictError("INVALID_INITIAL_CASE_STATUS", "예고 정전의 최초 대응 상태는 PREPARE여야 합니다.")
        if outage.status == OutageStatus.ACTIVE and body.status == ImpactCaseStatus.PREPARE:
            raise ConflictError("INVALID_INITIAL_CASE_STATUS", "진행 중 정전의 최초 대응 상태는 PREPARE일 수 없습니다.")
        case = ImpactCase(outage_id=outage_id, **body.model_dump())
        self.cases.add(case)
        self.db.flush()
        after = impact_case_view(case)
        self._audit(case, AuditAction.CREATED, actor_id, UserRole.CORE_ENGINE, body.risk_reason, None, after)
        self._commit("IMPACT_CASE_CREATE_CONFLICT", "대응 건 생성이 충돌했습니다.")
        return impact_case_view(case)

    def list_cases(self, outage_id: str) -> list[dict]:
        self._outage(outage_id)
        return [impact_case_view(case) for case in self.cases.list_by_outage(outage_id)]

    def get_case(self, case_id: str) -> dict:
        return impact_case_view(self._case(case_id))

    def transition_case(self, actor_id: str, case_id: str, body: ImpactCaseTransitionRequest) -> dict:
        case = self._case(case_id)
        self._version(case.version, body.version)
        if body.next_status not in CASE_TRANSITIONS[case.status]:
            raise ConflictError("INVALID_STATE_TRANSITION", "허용되지 않은 환자 대응 상태 전환입니다.")
        before = impact_case_view(case)
        case.status = body.next_status
        case.version += 1
        self._audit(case, AuditAction.STATE_CHANGED, actor_id, UserRole.CORE_ENGINE, body.reason, before, impact_case_view(case))
        self._commit("IMPACT_CASE_UPDATE_CONFLICT", "대응 상태 변경이 충돌했습니다.")
        return impact_case_view(case)

    def save_risk_result(self, actor_id: str, case_id: str, body: RiskResultRequest) -> dict:
        case = self._case(case_id)
        if case.status == ImpactCaseStatus.CLOSED:
            raise ConflictError("IMPACT_CASE_CLOSED", "종료된 대응 건의 위험도를 변경할 수 없습니다.")
        self._version(case.version, body.version)
        before = impact_case_view(case)
        case.risk_level = body.risk_level
        case.effective_runtime_minutes = body.effective_runtime_minutes
        case.runtime_unknown_reason = body.runtime_unknown_reason
        case.response_due_at = body.response_due_at
        case.risk_calculated_at = body.risk_calculated_at
        case.risk_reason = body.risk_reason
        case.version += 1
        self._audit(case, AuditAction.UPDATED, actor_id, UserRole.CORE_ENGINE, body.risk_reason, before, impact_case_view(case))
        self._commit("IMPACT_CASE_UPDATE_CONFLICT", "위험도 결과 저장이 충돌했습니다.")
        return impact_case_view(case)

    def _change_outage_status(self, outage, next_status, actor_id, reason, occurred_at):
        before, previous = outage_view(outage), outage.status
        outage.status, outage.version = next_status, outage.version + 1
        when = occurred_at or datetime.now(timezone.utc)
        if next_status == OutageStatus.ACTIVE: outage.started_at = when
        if next_status == OutageStatus.CANCELLED: outage.cancelled_at = when
        self._history(outage, previous, next_status, actor_id, UserRole.INSTITUTION_ADMIN, reason, when)
        self._audit(outage, AuditAction.STATE_CHANGED, actor_id, UserRole.INSTITUTION_ADMIN, reason, before, outage_view(outage))
        self._commit("OUTAGE_STATE_CONFLICT", "정전 상태 변경이 충돌했습니다.")
        return outage_view(outage)

    def _history(self, outage, previous, next_status, actor_id, role, reason, when=None):
        self.db.add(OutageEventHistory(outage_id=outage.id, previous_status=previous, next_status=next_status, actor_id=actor_id, actor_role=role, reason=reason, occurred_at=when or datetime.now(timezone.utc)))

    def _audit(self, entity, action, actor_id, role, reason, before, after):
        self.audits.add(AuditLog(entity_type=type(entity).__name__, entity_id=entity.id, action=action, actor_id=actor_id, actor_role=role, reason=reason, before_values=before, after_values=after))

    def _outage(self, outage_id):
        value = self.outages.find(outage_id)
        if value is None: raise NotFoundError("OUTAGE_NOT_FOUND", "정전을 찾을 수 없습니다.")
        return value

    def _case(self, case_id):
        value = self.cases.find(case_id)
        if value is None: raise NotFoundError("IMPACT_CASE_NOT_FOUND", "환자 대응 건을 찾을 수 없습니다.")
        return value

    @staticmethod
    def _version(current, requested):
        if current != requested: raise ConflictError("OPTIMISTIC_LOCK_CONFLICT", "다른 요청에서 먼저 변경되었습니다.")

    def _commit(self, code, message):
        try: self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise ConflictError(code, message) from exc
