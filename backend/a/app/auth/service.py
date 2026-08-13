from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..errors import AuthenticationError, ConflictError, ServiceUnavailableError
from ..models import Guardian, GuardianAccessCode, GuardianPatient, Patient, UserRole
from .presenters import guardian_view, patient_view, token_view
from ..patients.repositories import GuardianPatientRepository, PatientRepository
from .repositories import GuardianAccessCodeRepository, GuardianRepository
from .schemas import GuardianLoginRequest, GuardianSignupRequest, PatientLoginRequest
from ..security import digest_guardian_code, generate_guardian_code, hash_password, verify_password


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.guardians = GuardianRepository(db)
        self.patients = PatientRepository(db)
        self.codes = GuardianAccessCodeRepository(db)
        self.links = GuardianPatientRepository(db)

    def signup_guardian(self, body: GuardianSignupRequest) -> dict:
        if self.guardians.exists_by_phone(body.guardian_phone):
            raise ConflictError("PHONE_ALREADY_REGISTERED", "이미 가입된 보호자 전화번호입니다.")

        guardian = Guardian(name=body.guardian_name, phone=body.guardian_phone, password_hash=hash_password(body.password))
        patient = Patient(
            name=body.patient_name,
            phone=body.patient_phone,
            secondary_phone=body.secondary_phone,
            affiliated_institution=body.affiliated_institution,
            address=body.patient_address,
            diagnosis=body.diagnosis,
            electronic_devices=body.electronic_devices,
        )
        self.guardians.add(guardian)
        self.patients.add(patient)
        self.db.flush()
        self.links.add(GuardianPatient(guardian_id=guardian.id, patient_id=patient.id, priority=1))

        plain_code = self._new_unique_guardian_code()
        self.codes.add(
            GuardianAccessCode(
                guardian_id=guardian.id,
                patient_id=patient.id,
                code_digest=digest_guardian_code(plain_code),
            )
        )
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise ConflictError("SIGNUP_CONFLICT", "동일한 가입 정보가 이미 처리되었습니다.") from exc

        return {
            "role": UserRole.GUARDIAN.value,
            "token": token_view(guardian.id, UserRole.GUARDIAN),
            "guardian": guardian_view(guardian),
            "patients": [patient_view(patient)],
            "guardianCode": plain_code,
        }

    def login_guardian(self, body: GuardianLoginRequest) -> dict:
        guardian = self.guardians.find_active_by_phone_with_patients(body.phone)
        if guardian is None or not verify_password(body.password, guardian.password_hash):
            raise AuthenticationError("INVALID_CREDENTIALS", "전화번호 또는 비밀번호가 올바르지 않습니다.")
        patients = [link.patient for link in sorted(guardian.patient_links, key=lambda item: item.priority) if link.patient.is_active]
        return {
            "role": UserRole.GUARDIAN.value,
            "token": token_view(guardian.id, UserRole.GUARDIAN),
            "guardian": guardian_view(guardian),
            "patients": [patient_view(patient) for patient in patients],
        }

    def login_patient(self, body: PatientLoginRequest) -> dict:
        access_code = self.codes.find_active_with_accounts(digest_guardian_code(body.guardian_code))
        if (
            access_code is None
            or access_code.revoked_at is not None
            or not access_code.patient.is_active
            or not access_code.guardian.is_active
        ):
            raise AuthenticationError("INVALID_GUARDIAN_CODE", "보호자 코드가 유효하지 않습니다.")
        return {
            "role": UserRole.PATIENT.value,
            "token": token_view(access_code.patient.id, UserRole.PATIENT),
            "patient": patient_view(access_code.patient),
            "guardian": guardian_view(access_code.guardian),
        }

    def get_me(self, subject_id: str, role: UserRole) -> dict:
        if role == UserRole.GUARDIAN:
            guardian = self.guardians.find_active_by_id_with_patients(subject_id)
            if guardian is None:
                raise AuthenticationError("ACCOUNT_INACTIVE", "사용할 수 없는 계정입니다.")
            return {
                "role": role.value,
                "guardian": guardian_view(guardian),
                "patients": [patient_view(link.patient) for link in guardian.patient_links if link.patient.is_active],
            }

        patient = self.patients.find_active_by_id(subject_id)
        if patient is None:
            raise AuthenticationError("ACCOUNT_INACTIVE", "사용할 수 없는 계정입니다.")
        return {"role": role.value, "patient": patient_view(patient)}

    def _new_unique_guardian_code(self) -> str:
        for _ in range(10):
            candidate = generate_guardian_code()
            if not self.codes.exists_by_digest(digest_guardian_code(candidate)):
                return candidate
        raise ServiceUnavailableError("CODE_GENERATION_FAILED", "보호자 코드 생성에 실패했습니다.")
