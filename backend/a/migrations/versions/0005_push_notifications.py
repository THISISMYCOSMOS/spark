"""app push devices and disaster deliveries

Revision ID: 0006_push_notifications
Revises: 0005_ai_response_plan
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006_push_notifications"
down_revision = "0005_ai_response_plan"
branch_labels = None
depends_on = None


def _enum(bind, *values: str, name: str, already_exists: bool = False):
    if bind.dialect.name != "postgresql":
        return sa.Enum(*values, name=name)
    enum_type = postgresql.ENUM(*values, name=name, create_type=False)
    if not already_exists:
        postgresql.ENUM(*values, name=name).create(bind, checkfirst=True)
    return enum_type


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "push_devices" not in tables:
        op.create_table(
            "push_devices",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("owner_id", sa.String(36), nullable=False),
            sa.Column("owner_role", _enum(bind, "GUARDIAN", "PATIENT", "INSTITUTION_ADMIN", "CORE_ENGINE", name="userrole", already_exists=True), nullable=False),
            sa.Column("platform", _enum(bind, "IOS", "ANDROID", name="pushplatform"), nullable=False),
            sa.Column("provider", sa.String(30), nullable=False, server_default="EXPO"),
            sa.Column("token", sa.String(500), nullable=False, unique=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_push_devices_owner", "push_devices", ["owner_id", "owner_role", "is_active"])
    if "push_notification_deliveries" not in tables:
        op.create_table(
            "push_notification_deliveries",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("outage_id", sa.String(36), sa.ForeignKey("outage_events.id"), nullable=False),
            sa.Column("impact_case_id", sa.String(36), sa.ForeignKey("impact_cases.id"), nullable=False),
            sa.Column("notification_type", _enum(bind, "DISASTER_ALERT", name="pushnotificationtype"), nullable=False),
            sa.Column("recipient_id", sa.String(36), nullable=False),
            sa.Column("recipient_role", _enum(bind, "GUARDIAN", "PATIENT", "INSTITUTION_ADMIN", "CORE_ENGINE", name="userrole", already_exists=True), nullable=False),
            sa.Column("escalation_round", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("mode", _enum(bind, "TEST", "LIVE", name="operationmode", already_exists=True), nullable=False),
            sa.Column("disaster_type", _enum(bind, "POWER_OUTAGE", "TYPHOON", "EARTHQUAKE", "COLD_WAVE", "FIRE", name="disastertype", already_exists=True), nullable=False),
            sa.Column("title", sa.String(100), nullable=False),
            sa.Column("body", sa.String(500), nullable=False),
            sa.Column("provider", sa.String(30), nullable=False),
            sa.Column("status", _enum(bind, "PENDING", "ACCEPTED", "FAILED", name="pushdeliverystatus"), nullable=False),
            sa.Column("provider_message_ids", sa.JSON(), nullable=False),
            sa.Column("last_error", sa.String(200)),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("provider_accepted_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("impact_case_id", "notification_type", "recipient_id", "escalation_round", name="uq_push_delivery_case_type_recipient_round"),
        )
        op.create_index("ix_push_deliveries_case_status", "push_notification_deliveries", ["impact_case_id", "status"])


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "push_notification_deliveries" in tables:
        op.drop_table("push_notification_deliveries")
    if "push_devices" in tables:
        op.drop_table("push_devices")
