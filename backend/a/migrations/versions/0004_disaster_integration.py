"""disaster PDF and core integration

Revision ID: 0004_disaster_integration
Revises: 0004_ab_contract_alignment
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_disaster_integration"
down_revision = "0004_ab_contract_alignment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("outage_events")}
    existing_indexes = {index["name"] for index in inspector.get_indexes("outage_events")}
    existing_unique = {constraint["name"] for constraint in inspector.get_unique_constraints("outage_events")}
    disaster_type = sa.Enum("POWER_OUTAGE", "TYPHOON", "EARTHQUAKE", "COLD_WAVE", "FIRE", name="disastertype")
    if "disaster_type" not in existing_columns:
        op.add_column("outage_events", sa.Column("disaster_type", disaster_type, nullable=False, server_default="POWER_OUTAGE"))
    if "severity" not in existing_columns:
        op.add_column("outage_events", sa.Column("severity", sa.String(length=20), nullable=True))
    if "official_guidance_codes" not in existing_columns:
        op.add_column("outage_events", sa.Column("official_guidance_codes", sa.JSON(), nullable=False, server_default="[]"))
    if "source_document_sha256" not in existing_columns:
        op.add_column("outage_events", sa.Column("source_document_sha256", sa.String(length=64), nullable=True))
    constraint_name = "uq_outage_events_source_document_sha256"
    if constraint_name not in existing_indexes and constraint_name not in existing_unique:
        op.create_index(constraint_name, "outage_events", ["source_document_sha256"], unique=True)


def downgrade() -> None:
    # The original baseline migration creates tables from current metadata, so
    # some databases already contain these columns before this revision. A
    # destructive downgrade cannot distinguish those databases safely. Keep the
    # additive disaster fields and only move the Alembic revision backwards.
    pass
