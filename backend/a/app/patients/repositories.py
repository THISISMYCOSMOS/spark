from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import GuardianPatient, Patient, PowerProfile


class PatientRepository:
    def __init__(self, db: Session):
        self.db = db

    def find_active_by_id(self, patient_id: str) -> Patient | None:
        return self.db.scalar(
            select(Patient).where(Patient.id == patient_id, Patient.is_active.is_(True))
        )

    def find_active_by_id_full(self, patient_id: str) -> Patient | None:
        return self.db.scalar(
            select(Patient)
            .options(
                selectinload(Patient.power_profile).selectinload(PowerProfile.devices),
                selectinload(Patient.emergency_contacts),
                selectinload(Patient.guardian_links),
            )
            .where(Patient.id == patient_id, Patient.is_active.is_(True))
        )

    def add(self, patient: Patient) -> None:
        self.db.add(patient)

    def list_active_by_region_code(self, region_code: str) -> list[Patient]:
        statement = (
            select(Patient)
            .options(
                selectinload(Patient.power_profile).selectinload(PowerProfile.devices),
                selectinload(Patient.emergency_contacts),
                selectinload(Patient.guardian_links),
            )
            .where(
                Patient.region_code == region_code,
                Patient.is_active.is_(True),
            )
            .order_by(Patient.id)
        )
        return list(self.db.scalars(statement))


class GuardianPatientRepository:
    def __init__(self, db: Session):
        self.db = db

    def add(self, link: GuardianPatient) -> None:
        self.db.add(link)

    def exists(self, guardian_id: str, patient_id: str) -> bool:
        return self.db.scalar(
            select(GuardianPatient.id).where(
                GuardianPatient.guardian_id == guardian_id,
                GuardianPatient.patient_id == patient_id,
            )
        ) is not None
