"""persist proposed AI response plans

Revision ID: 0005_ai_response_plan
Revises: 0004_disaster_integration
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_ai_response_plan"
down_revision = "0004_disaster_integration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing_columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("impact_cases")
    }
    if "response_plan" not in existing_columns:
        op.add_column("impact_cases", sa.Column("response_plan", sa.JSON(), nullable=True))
    if "response_plan_updated_at" not in existing_columns:
        op.add_column("impact_cases", sa.Column("response_plan_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    existing_columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("impact_cases")
    }
    if "response_plan_updated_at" in existing_columns:
        op.drop_column("impact_cases", "response_plan_updated_at")
    if "response_plan" in existing_columns:
        op.drop_column("impact_cases", "response_plan")
