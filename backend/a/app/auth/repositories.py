from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Guardian, GuardianAccessCode, GuardianPatient


class GuardianRepository:
    def __init__(self, db: Session):
        self.db = db

    def exists_by_phone(self, phone: str) -> bool:
        return self.db.scalar(select(Guardian.id).where(Guardian.phone == phone)) is not None

    def find_active_by_phone_with_patients(self, phone: str) -> Guardian | None:
        return self.db.scalar(
            select(Guardian)
            .options(selectinload(Guardian.patient_links).selectinload(GuardianPatient.patient))
            .where(Guardian.phone == phone, Guardian.is_active.is_(True))
        )

    def find_active_by_id_with_patients(self, guardian_id: str) -> Guardian | None:
        return self.db.scalar(
            select(Guardian)
            .options(selectinload(Guardian.patient_links).selectinload(GuardianPatient.patient))
            .where(Guardian.id == guardian_id, Guardian.is_active.is_(True))
        )

    def add(self, guardian: Guardian) -> None:
        self.db.add(guardian)


class GuardianAccessCodeRepository:
    def __init__(self, db: Session):
        self.db = db

    def exists_by_digest(self, digest: str) -> bool:
        return self.db.scalar(
            select(GuardianAccessCode.id).where(GuardianAccessCode.code_digest == digest)
        ) is not None

    def find_active_with_accounts(self, digest: str) -> GuardianAccessCode | None:
        return self.db.scalar(
            select(GuardianAccessCode)
            .options(
                selectinload(GuardianAccessCode.patient),
                selectinload(GuardianAccessCode.guardian),
            )
            .where(
                GuardianAccessCode.code_digest == digest,
                GuardianAccessCode.is_active.is_(True),
            )
        )

    def add(self, access_code: GuardianAccessCode) -> None:
        self.db.add(access_code)
