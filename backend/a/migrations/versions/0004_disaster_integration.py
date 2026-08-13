"""disaster PDF and core integration

Revision ID: 0004_disaster_integration
Revises: 0003_response_recovery
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_disaster_integration"
down_revision = "0003_response_recovery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    disaster_type = sa.Enum("POWER_OUTAGE", "TYPHOON", "EARTHQUAKE", "COLD_WAVE", "FIRE", name="disastertype")
    with op.batch_alter_table("outage_events") as batch_op:
        batch_op.add_column(sa.Column("disaster_type", disaster_type, nullable=False, server_default="POWER_OUTAGE"))
        batch_op.add_column(sa.Column("severity", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("official_guidance_codes", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.add_column(sa.Column("source_document_sha256", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("uq_outage_events_source_document_sha256", ["source_document_sha256"])


def downgrade() -> None:
    with op.batch_alter_table("outage_events") as batch_op:
        batch_op.drop_constraint("uq_outage_events_source_document_sha256", type_="unique")
        batch_op.drop_column("source_document_sha256")
        batch_op.drop_column("official_guidance_codes")
        batch_op.drop_column("severity")
        batch_op.drop_column("disaster_type")
