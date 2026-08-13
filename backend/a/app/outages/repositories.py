from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ImpactCase, ImpactCaseStatus, OutageEvent, Patient, RiskPolicy


class OutageRepository:
    def __init__(self, db: Session):
        self.db = db

    def add(self, value: OutageEvent) -> None:
        self.db.add(value)

    def find(self, outage_id: str) -> OutageEvent | None:
        return self.db.get(OutageEvent, outage_id)


class ImpactCaseRepository:
    def __init__(self, db: Session):
        self.db = db

    def add(self, value: ImpactCase) -> None:
        self.db.add(value)

    def find(self, case_id: str) -> ImpactCase | None:
        return self.db.get(ImpactCase, case_id)

    def exists(self, outage_id: str, patient_id: str) -> bool:
        statement = select(ImpactCase.id).where(
            ImpactCase.outage_id == outage_id,
            ImpactCase.patient_id == patient_id,
        )
        return self.db.scalar(statement) is not None

    def list_by_outage(self, outage_id: str) -> list[ImpactCase]:
        statement = (
            select(ImpactCase)
            .where(ImpactCase.outage_id == outage_id)
            .order_by(ImpactCase.created_at)
        )
        return list(self.db.scalars(statement))

    def find_current_by_patient(self, patient_id: str) -> ImpactCase | None:
        statement = (
            select(ImpactCase)
            .where(
                ImpactCase.patient_id == patient_id,
                ImpactCase.status != ImpactCaseStatus.CLOSED,
            )
            .order_by(ImpactCase.created_at.desc())
            .limit(1)
        )
        return self.db.scalar(statement)


class RiskPolicyRepository:
    def __init__(self, db: Session):
        self.db = db

    def find(self, policy_id: str) -> RiskPolicy | None:
        return self.db.get(RiskPolicy, policy_id)


class PatientExistenceRepository:
    def __init__(self, db: Session):
        self.db = db

    def active_exists(self, patient_id: str) -> bool:
        statement = select(Patient.id).where(
            Patient.id == patient_id,
            Patient.is_active.is_(True),
        )
        return self.db.scalar(statement) is not None
