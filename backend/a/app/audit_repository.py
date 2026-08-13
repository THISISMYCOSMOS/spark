from sqlalchemy.orm import Session

from .models import AuditLog


class AuditLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def add(self, audit_log: AuditLog) -> None:
        self.db.add(audit_log)
