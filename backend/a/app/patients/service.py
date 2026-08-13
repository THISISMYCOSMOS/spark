from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..errors import ConflictError, ForbiddenError, NotFoundError
from ..models import AuditAction, AuditLog, EmergencyContact, GuardianPatient, MedicalDevice, Patient, PowerProfile, UserRole
from ..audit_repository import AuditLogRepository
from .presenters import patient_audit_snapshot, patient_detail
from .repositories import GuardianPatientRepository, PatientRepository
from .schemas import PatientCreateRequest, PatientUpdateRequest, PatientWriteRequest


class PatientService:
    def __init__(self, db: Session):
        self.db = db
        self.patients = PatientRepository(db)
        self.links = GuardianPatientRepository(db)
        self.audit_logs = AuditLogRepository(db)

    def create(self, guardian_id: str, body: PatientCreateRequest) -> dict:
        patient = Patient(
            name=body.name,
            phone=body.phone,
            secondary_phone=body.secondary_phone,
            affiliated_institution=body.affiliated_institution,
            address=body.address,
            address_detail=body.address_detail,
            region_code=body.region_code.upper(),
            diagnosis=body.diagnosis,
            electronic_devices=[device.device_type for device in body.power_profile.devices],
        )
        self.db.add(patient)
        self.db.flush()
        self.links.add(GuardianPatient(guardian_id=guardian_id, patient_id=patient.id, priority=1))
        self._replace_domain_details(patient, body)
        self.db.flush()
        self.audit_logs.add(
            AuditLog(
                entity_type="Patient",
                entity_id=patient.id,
                action=AuditAction.CREATED,
                actor_id=guardian_id,
                actor_role=UserRole.GUARDIAN,
                reason=body.change_reason,
                before_values=None,
                after_values=patient_audit_snapshot(patient),
            )
        )
        self._commit("PATIENT_CREATE_CONFLICT", "환자 등록 중 중복 데이터가 발견됐습니다.")
        return patient_detail(patient)

    def get(self, actor_id: str, role: UserRole, patient_id: str) -> dict:
        patient = self._authorized_patient(actor_id, role, patient_id, write=False)
        return patient_detail(patient)

    def update(self, guardian_id: str, patient_id: str, body: PatientUpdateRequest) -> dict:
        patient = self._authorized_patient(guardian_id, UserRole.GUARDIAN, patient_id, write=True)
        if patient.version != body.version:
            raise ConflictError("OPTIMISTIC_LOCK_CONFLICT", "다른 요청에서 환자 정보가 먼저 변경됐습니다.")
        before = patient_audit_snapshot(patient)
        patient.name = body.name
        patient.phone = body.phone
        patient.secondary_phone = body.secondary_phone
        patient.affiliated_institution = body.affiliated_institution
        patient.address = body.address
        patient.address_detail = body.address_detail
        patient.region_code = body.region_code.upper()
        patient.diagnosis = body.diagnosis
        patient.electronic_devices = [device.device_type for device in body.power_profile.devices]
        patient.version += 1
        self._replace_domain_details(patient, body)
        self.db.flush()
        self.audit_logs.add(
            AuditLog(
                entity_type="Patient",
                entity_id=patient.id,
                action=AuditAction.UPDATED,
                actor_id=guardian_id,
                actor_role=UserRole.GUARDIAN,
                reason=body.change_reason,
                before_values=before,
                after_values=patient_audit_snapshot(patient),
            )
        )
        self._commit("PATIENT_UPDATE_CONFLICT", "환자 정보 변경 중 중복 데이터가 발견됐습니다.")
        return patient_detail(patient)

    def _authorized_patient(self, actor_id: str, role: UserRole, patient_id: str, write: bool) -> Patient:
        patient = self.patients.find_active_by_id_full(patient_id)
        if patient is None:
            raise NotFoundError("PATIENT_NOT_FOUND", "환자를 찾을 수 없습니다.")
        allowed = (role == UserRole.PATIENT and actor_id == patient_id and not write) or (
            role == UserRole.GUARDIAN and self.links.exists(actor_id, patient_id)
        )
        if not allowed:
            raise ForbiddenError("PATIENT_ACCESS_DENIED", "해당 환자 정보에 접근할 권한이 없습니다.")
        return patient

    def _replace_domain_details(self, patient: Patient, body: PatientWriteRequest) -> None:
        if patient.power_profile is None:
            patient.power_profile = PowerProfile()
        profile = patient.power_profile
        profile.safety_margin_minutes = body.power_profile.safety_margin_minutes
        profile.backup_power_runtime_minutes = body.power_profile.backup_power_runtime_minutes
        profile.backup_power_verified = body.power_profile.backup_power_verified
        profile.version = (profile.version or 0) + 1
        if profile.devices:
            profile.devices.clear()
            self.db.flush()
        profile.devices = [
            MedicalDevice(
                device_type=item.device_type,
                model_name=item.model_name,
                battery_runtime_minutes=item.battery_runtime_minutes,
                runtime_verified=item.runtime_verified,
                is_essential=item.is_essential,
            )
            for item in body.power_profile.devices
        ]
        if patient.emergency_contacts:
            patient.emergency_contacts.clear()
            self.db.flush()
        patient.emergency_contacts = [
            EmergencyContact(
                name=item.name,
                phone=item.phone,
                relationship=item.relationship,
                priority=item.priority,
            )
            for item in body.emergency_contacts
        ]

    def _commit(self, code: str, message: str) -> None:
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise ConflictError(code, message) from exc
