import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    GUARDIAN = "GUARDIAN"
    PATIENT = "PATIENT"
    INSTITUTION_ADMIN = "INSTITUTION_ADMIN"
    CORE_ENGINE = "CORE_ENGINE"


class AuditAction(str, enum.Enum):
    CREATED = "CREATED"
    UPDATED = "UPDATED"
    STATE_CHANGED = "STATE_CHANGED"


class OperationMode(str, enum.Enum):
    TEST = "TEST"
    LIVE = "LIVE"


class OutageType(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    UNPLANNED = "UNPLANNED"


class DisasterType(str, enum.Enum):
    POWER_OUTAGE = "POWER_OUTAGE"
    TYPHOON = "TYPHOON"
    EARTHQUAKE = "EARTHQUAKE"
    COLD_WAVE = "COLD_WAVE"
    FIRE = "FIRE"


class OutageStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    RECOVERY_REPORTED = "RECOVERY_REPORTED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class ImpactCaseStatus(str, enum.Enum):
    PREPARE = "PREPARE"
    WAITING_PATIENT = "WAITING_PATIENT"
    MONITORING = "MONITORING"
    ACTION_REQUIRED = "ACTION_REQUIRED"
    GUARDIAN_ACTING = "GUARDIAN_ACTING"
    RECOVERY_CHECK = "RECOVERY_CHECK"
    CLOSED = "CLOSED"


class RiskLevel(str, enum.Enum):
    WATCH = "WATCH"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class StatusCheckPurpose(str, enum.Enum):
    OUTAGE_CHECK = "OUTAGE_CHECK"
    RECOVERY_CHECK = "RECOVERY_CHECK"


class StatusCheckStatus(str, enum.Enum):
    PENDING = "PENDING"
    RESPONDED = "RESPONDED"
    TIMED_OUT = "TIMED_OUT"
    CANCELLED = "CANCELLED"


class PatientResponseType(str, enum.Enum):
    OK = "OK"
    NEED_HELP = "NEED_HELP"
    EQUIPMENT_ISSUE = "EQUIPMENT_ISSUE"


class GuardianActionStatus(str, enum.Enum):
    CONTACTED = "CONTACTED"
    ACTING = "ACTING"
    UNAVAILABLE = "UNAVAILABLE"
    COMPLETED = "COMPLETED"


class Guardian(Base):
    __tablename__ = "guardians"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    patient_links: Mapped[list["GuardianPatient"]] = orm_relationship(back_populates="guardian", cascade="all, delete-orphan")
    access_codes: Mapped[list["GuardianAccessCode"]] = orm_relationship(back_populates="guardian", cascade="all, delete-orphan")


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    secondary_phone: Mapped[str | None] = mapped_column(String(20))
    affiliated_institution: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    region_code: Mapped[str] = mapped_column(String(20), nullable=False, default="UNKNOWN")
    address_detail: Mapped[str | None] = mapped_column(String(200))
    diagnosis: Mapped[str] = mapped_column(String(500), nullable=False)
    electronic_devices: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    guardian_links: Mapped[list["GuardianPatient"]] = orm_relationship(back_populates="patient", cascade="all, delete-orphan")
    power_profile: Mapped["PowerProfile | None"] = orm_relationship(back_populates="patient", cascade="all, delete-orphan", uselist=False)
    emergency_contacts: Mapped[list["EmergencyContact"]] = orm_relationship(back_populates="patient", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_patients_phone", "phone"), Index("ix_patients_region_code", "region_code"))


class GuardianPatient(Base):
    __tablename__ = "guardian_patients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    guardian_id: Mapped[str] = mapped_column(ForeignKey("guardians.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    guardian: Mapped[Guardian] = orm_relationship(back_populates="patient_links")
    patient: Mapped[Patient] = orm_relationship(back_populates="guardian_links")

    __table_args__ = (
        UniqueConstraint("guardian_id", "patient_id", name="uq_guardian_patient"),
        Index("ix_guardian_patients_patient", "patient_id"),
    )


class GuardianAccessCode(Base):
    __tablename__ = "guardian_access_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    guardian_id: Mapped[str] = mapped_column(ForeignKey("guardians.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False)
    code_digest: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    guardian: Mapped[Guardian] = orm_relationship(back_populates="access_codes")
    patient: Mapped[Patient] = orm_relationship()

    __table_args__ = (Index("ix_guardian_access_codes_patient", "patient_id"),)


class PowerProfile(Base):
    __tablename__ = "power_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False, unique=True)
    safety_margin_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    backup_power_runtime_minutes: Mapped[int | None] = mapped_column(Integer)
    backup_power_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    patient: Mapped[Patient] = orm_relationship(back_populates="power_profile")
    devices: Mapped[list["MedicalDevice"]] = orm_relationship(back_populates="power_profile", cascade="all, delete-orphan")


class MedicalDevice(Base):
    __tablename__ = "medical_devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    power_profile_id: Mapped[str] = mapped_column(ForeignKey("power_profiles.id"), nullable=False)
    device_type: Mapped[str] = mapped_column(String(100), nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(100))
    battery_runtime_minutes: Mapped[int | None] = mapped_column(Integer)
    runtime_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_essential: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    power_profile: Mapped[PowerProfile] = orm_relationship(back_populates="devices")

    __table_args__ = (Index("ix_medical_devices_profile", "power_profile_id"),)


class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False)
    guardian_id: Mapped[str | None] = mapped_column(ForeignKey("guardians.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    relationship: Mapped[str | None] = mapped_column(String(100))
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    patient: Mapped[Patient] = orm_relationship(back_populates="emergency_contacts")
    guardian: Mapped[Guardian | None] = orm_relationship()

    __table_args__ = (
        UniqueConstraint("patient_id", "priority", name="uq_emergency_contact_patient_priority"),
        UniqueConstraint("patient_id", "phone", name="uq_emergency_contact_patient_phone"),
        Index("ix_emergency_contacts_patient", "patient_id"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    action: Mapped[AuditAction] = mapped_column(Enum(AuditAction), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor_role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    before_values: Mapped[dict | None] = mapped_column(JSON)
    after_values: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (Index("ix_audit_logs_entity", "entity_type", "entity_id", "created_at"),)


class RiskPolicy(Base):
    __tablename__ = "risk_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    is_demo_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rules: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (UniqueConstraint("name", "version", name="uq_risk_policy_name_version"),)


class OutageEvent(Base):
    __tablename__ = "outage_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    outage_type: Mapped[OutageType] = mapped_column(Enum(OutageType), nullable=False)
    disaster_type: Mapped[DisasterType] = mapped_column(Enum(DisasterType), nullable=False, default=DisasterType.POWER_OUTAGE)
    severity: Mapped[str | None] = mapped_column(String(20))
    official_guidance_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    source_document_sha256: Mapped[str | None] = mapped_column(String(64), unique=True)
    mode: Mapped[OperationMode] = mapped_column(Enum(OperationMode), nullable=False)
    status: Mapped[OutageStatus] = mapped_column(Enum(OutageStatus), nullable=False)
    region_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    scheduled_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expected_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recovery_reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recovery_source: Mapped[str | None] = mapped_column(String(200))
    source: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    impact_cases: Mapped[list["ImpactCase"]] = orm_relationship(back_populates="outage", cascade="all, delete-orphan")
    histories: Mapped[list["OutageEventHistory"]] = orm_relationship(back_populates="outage", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_outage_events_status_mode", "status", "mode"),)


class ImpactCase(Base):
    __tablename__ = "impact_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    outage_id: Mapped[str] = mapped_column(ForeignKey("outage_events.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False)
    status: Mapped[ImpactCaseStatus] = mapped_column(Enum(ImpactCaseStatus), nullable=False)
    risk_level: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel), nullable=False)
    risk_policy_id: Mapped[str] = mapped_column(ForeignKey("risk_policies.id"), nullable=False)
    risk_policy_version: Mapped[int] = mapped_column(Integer, nullable=False)
    effective_runtime_minutes: Mapped[int | None] = mapped_column(Integer)
    runtime_unknown_reason: Mapped[str | None] = mapped_column(String(500))
    response_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    risk_calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    risk_reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    outage: Mapped[OutageEvent] = orm_relationship(back_populates="impact_cases")
    patient: Mapped[Patient] = orm_relationship()
    risk_policy: Mapped[RiskPolicy] = orm_relationship()
    status_checks: Mapped[list["StatusCheck"]] = orm_relationship(back_populates="impact_case", cascade="all, delete-orphan")
    guardian_actions: Mapped[list["GuardianAction"]] = orm_relationship(back_populates="impact_case", cascade="all, delete-orphan")
    recovery_confirmations: Mapped[list["RecoveryConfirmation"]] = orm_relationship(back_populates="impact_case", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("outage_id", "patient_id", name="uq_impact_case_outage_patient"),
        Index("ix_impact_cases_outage_status", "outage_id", "status"),
        Index("ix_impact_cases_patient", "patient_id"),
        Index("ix_impact_cases_risk", "risk_level"),
    )


class OutageEventHistory(Base):
    __tablename__ = "outage_event_histories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    outage_id: Mapped[str] = mapped_column(ForeignKey("outage_events.id"), nullable=False)
    previous_status: Mapped[OutageStatus | None] = mapped_column(Enum(OutageStatus))
    next_status: Mapped[OutageStatus] = mapped_column(Enum(OutageStatus), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor_role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    outage: Mapped[OutageEvent] = orm_relationship(back_populates="histories")

    __table_args__ = (Index("ix_outage_history_outage_time", "outage_id", "occurred_at"),)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    scope: Mapped[str] = mapped_column(String(200), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (
        UniqueConstraint("actor_id", "scope", "idempotency_key", name="uq_idempotency_actor_scope_key"),
        Index("ix_idempotency_created_at", "created_at"),
    )


class StatusCheck(Base):
    __tablename__ = "status_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    impact_case_id: Mapped[str] = mapped_column(ForeignKey("impact_cases.id"), nullable=False)
    purpose: Mapped[StatusCheckPurpose] = mapped_column(Enum(StatusCheckPurpose), nullable=False)
    status: Mapped[StatusCheckStatus] = mapped_column(Enum(StatusCheckStatus), nullable=False, default=StatusCheckStatus.PENDING)
    token_digest: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    provider_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    response_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    token_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timed_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    impact_case: Mapped[ImpactCase] = orm_relationship(back_populates="status_checks")
    patient_response: Mapped["PatientResponse | None"] = orm_relationship(back_populates="status_check", uselist=False)
    recovery_confirmation: Mapped["RecoveryConfirmation | None"] = orm_relationship(back_populates="status_check", uselist=False)

    __table_args__ = (Index("ix_status_checks_case_status", "impact_case_id", "status"),)


class PatientResponse(Base):
    __tablename__ = "patient_responses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status_check_id: Mapped[str] = mapped_column(ForeignKey("status_checks.id"), nullable=False, unique=True)
    response_type: Mapped[PatientResponseType] = mapped_column(Enum(PatientResponseType), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    responded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    status_check: Mapped[StatusCheck] = orm_relationship(back_populates="patient_response")


class GuardianAction(Base):
    __tablename__ = "guardian_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    impact_case_id: Mapped[str] = mapped_column(ForeignKey("impact_cases.id"), nullable=False)
    emergency_contact_id: Mapped[str | None] = mapped_column(ForeignKey("emergency_contacts.id"))
    guardian_id: Mapped[str | None] = mapped_column(ForeignKey("guardians.id"))
    status: Mapped[GuardianActionStatus] = mapped_column(Enum(GuardianActionStatus), nullable=False)
    escalation_round: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    acted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    impact_case: Mapped[ImpactCase] = orm_relationship(back_populates="guardian_actions")
    emergency_contact: Mapped[EmergencyContact | None] = orm_relationship()
    guardian: Mapped[Guardian | None] = orm_relationship()

    __table_args__ = (
        UniqueConstraint("impact_case_id", "emergency_contact_id", "escalation_round", name="uq_guardian_action_case_contact_round"),
        Index("ix_guardian_actions_case", "impact_case_id"),
    )


class RecoveryConfirmation(Base):
    __tablename__ = "recovery_confirmations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    impact_case_id: Mapped[str] = mapped_column(ForeignKey("impact_cases.id"), nullable=False)
    status_check_id: Mapped[str | None] = mapped_column(ForeignKey("status_checks.id"), unique=True)
    home_power_restored: Mapped[bool] = mapped_column(Boolean, nullable=False)
    device_operating_normally: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confirmed_by_id: Mapped[str] = mapped_column(String(36), nullable=False)
    confirmed_by_role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    impact_case: Mapped[ImpactCase] = orm_relationship(back_populates="recovery_confirmations")
    status_check: Mapped[StatusCheck | None] = orm_relationship(back_populates="recovery_confirmation")

    __table_args__ = (Index("ix_recovery_confirmations_case", "impact_case_id", "confirmed_at"),)
