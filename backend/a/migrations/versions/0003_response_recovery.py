"""responses, guardian actions and recovery

Revision ID: 0003_response_recovery
Revises: 0002_outage_domain
"""
from alembic import op
import sqlalchemy as sa


revision = "0003_response_recovery"
down_revision = "0002_outage_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {item["name"] for item in sa.inspect(bind).get_columns("outage_events")}
    with op.batch_alter_table("outage_events") as batch_op:
        if "recovery_reported_at" not in columns:
            batch_op.add_column(sa.Column("recovery_reported_at", sa.DateTime(timezone=True), nullable=True))
        if "recovery_source" not in columns:
            batch_op.add_column(sa.Column("recovery_source", sa.String(length=200), nullable=True))
    from app.database import Base
    from app import models  # noqa: F401
    names = ["status_checks", "patient_responses", "guardian_actions", "recovery_confirmations"]
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables[name] for name in names])


def downgrade() -> None:
    from app.database import Base
    from app import models  # noqa: F401
    names = ["recovery_confirmations", "guardian_actions", "patient_responses", "status_checks"]
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[name] for name in names])
    with op.batch_alter_table("outage_events") as batch_op:
        batch_op.drop_column("recovery_source")
        batch_op.drop_column("recovery_reported_at")
