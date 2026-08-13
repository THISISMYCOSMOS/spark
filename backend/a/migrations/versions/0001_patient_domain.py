"""patient domain baseline

Revision ID: 0001_patient_domain
Revises:
"""
from alembic import op
import sqlalchemy as sa


revision = "0001_patient_domain"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 모델 메타데이터가 단일 진실 원천이다. 초기 배포에서 전체 스키마를 생성한다.
    from app.database import Base
    from app import models  # noqa: F401
    table_names = [
        "guardians", "patients", "guardian_patients", "guardian_access_codes",
        "power_profiles", "medical_devices", "emergency_contacts", "audit_logs",
    ]
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables[name] for name in table_names])


def downgrade() -> None:
    from app.database import Base
    from app import models  # noqa: F401
    table_names = [
        "audit_logs", "emergency_contacts", "medical_devices", "power_profiles",
        "guardian_access_codes", "guardian_patients", "patients", "guardians",
    ]
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[name] for name in table_names])
