"""outage and impact case domain

Revision ID: 0002_outage_domain
Revises: 0001_patient_domain
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_outage_domain"
down_revision = "0001_patient_domain"
branch_labels = None
depends_on = None

DEMO_POLICY_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    bind = op.get_bind()
    from app.database import Base
    from app import models  # noqa: F401
    table_names = ["risk_policies", "outage_events", "impact_cases", "outage_event_histories", "idempotency_records"]
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables[name] for name in table_names])
    # The baseline migration creates audit_logs from the current model metadata,
    # so PostgreSQL already has these named enum types. Re-altering the columns
    # would issue CREATE TYPE again and fail a clean deployment with
    # DuplicateObject. SQLite still needs the legacy value-width conversion used
    # by the original migration path.
    if bind.dialect.name != "postgresql":
        with op.batch_alter_table("audit_logs") as batch_op:
            batch_op.alter_column(
                "action",
                existing_type=sa.String(length=7),
                type_=sa.Enum("CREATED", "UPDATED", "STATE_CHANGED", name="auditaction"),
                existing_nullable=False,
            )
            batch_op.alter_column(
                "actor_role",
                existing_type=sa.String(length=8),
                type_=sa.Enum("GUARDIAN", "PATIENT", "INSTITUTION_ADMIN", "CORE_ENGINE", name="userrole"),
                existing_nullable=False,
            )
    risk_policies = Base.metadata.tables["risk_policies"]
    op.bulk_insert(risk_policies, [{
        "id": DEMO_POLICY_ID,
        "name": "DEMO_ONLY_DEFAULT",
        "version": 1,
        "is_demo_only": True,
        "rules": {
            "watch": "remainingRatio > 0.5",
            "high": "0.2 < remainingRatio <= 0.5",
            "critical": "remainingRatio <= 0.2",
            "notice": "의료 기준이 아닌 시연 정책",
        },
        "is_active": True,
    }])


def downgrade() -> None:
    from app.database import Base
    from app import models  # noqa: F401
    table_names = ["idempotency_records", "outage_event_histories", "impact_cases", "outage_events", "risk_policies"]
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[name] for name in table_names])
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.alter_column("action", existing_type=sa.String(length=13), type_=sa.String(length=7), existing_nullable=False)
        batch_op.alter_column("actor_role", existing_type=sa.String(length=17), type_=sa.String(length=8), existing_nullable=False)
