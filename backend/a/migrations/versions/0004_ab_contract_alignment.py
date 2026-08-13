"""align Backend A persistence with Backend B canonical contract

Revision ID: 0004_ab_contract_alignment
Revises: 0003_response_recovery
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_ab_contract_alignment"
down_revision = "0003_response_recovery"
branch_labels = None
depends_on = None


def _replace_postgresql_enum(
    *,
    table_name: str,
    column_name: str,
    current_type_name: str,
    replacement_type_name: str,
    replacement_values: tuple[str, ...],
    value_expression: str,
) -> None:
    values = ", ".join(f"'{value}'" for value in replacement_values)
    op.execute(sa.text(f"CREATE TYPE {replacement_type_name} AS ENUM ({values})"))
    op.execute(
        sa.text(
            f"ALTER TABLE {table_name} "
            f"ALTER COLUMN {column_name} TYPE {replacement_type_name} "
            f"USING ({value_expression})::{replacement_type_name}"
        )
    )
    op.execute(sa.text(f"DROP TYPE {current_type_name}"))
    op.execute(sa.text(f"ALTER TYPE {replacement_type_name} RENAME TO {current_type_name}"))


def _upgrade_contract_enums(bind) -> None:
    if bind.dialect.name == "postgresql":
        _replace_postgresql_enum(
            table_name="patient_responses",
            column_name="response_type",
            current_type_name="patientresponsetype",
            replacement_type_name="patientresponsetype_ab_v2",
            replacement_values=("NORMAL", "NEED_HELP", "EQUIPMENT_ISSUE"),
            value_expression="CASE response_type::text WHEN 'OK' THEN 'NORMAL' ELSE response_type::text END",
        )
        _replace_postgresql_enum(
            table_name="status_checks",
            column_name="purpose",
            current_type_name="statuscheckpurpose",
            replacement_type_name="statuscheckpurpose_ab_v2",
            replacement_values=("OUTAGE_STATUS", "RECOVERY_CONFIRMATION"),
            value_expression=(
                "CASE purpose::text "
                "WHEN 'OUTAGE_CHECK' THEN 'OUTAGE_STATUS' "
                "WHEN 'RECOVERY_CHECK' THEN 'RECOVERY_CONFIRMATION' "
                "ELSE purpose::text END"
            ),
        )
        return

    with op.batch_alter_table("patient_responses") as batch_op:
        batch_op.add_column(sa.Column("response_type_canonical", sa.String(length=32), nullable=True))
    bind.execute(sa.text("UPDATE patient_responses SET response_type_canonical = CASE response_type WHEN 'OK' THEN 'NORMAL' ELSE response_type END"))
    with op.batch_alter_table("patient_responses") as batch_op:
        batch_op.drop_column("response_type")
        batch_op.alter_column(
            "response_type_canonical",
            new_column_name="response_type",
            existing_type=sa.String(length=32),
            type_=sa.Enum("NORMAL", "NEED_HELP", "EQUIPMENT_ISSUE", name="patientresponsetype"),
            nullable=False,
        )

    with op.batch_alter_table("status_checks") as batch_op:
        batch_op.add_column(sa.Column("purpose_canonical", sa.String(length=32), nullable=True))
    bind.execute(sa.text("UPDATE status_checks SET purpose_canonical = CASE purpose WHEN 'OUTAGE_CHECK' THEN 'OUTAGE_STATUS' WHEN 'RECOVERY_CHECK' THEN 'RECOVERY_CONFIRMATION' ELSE purpose END"))
    with op.batch_alter_table("status_checks") as batch_op:
        batch_op.drop_column("purpose")
        batch_op.alter_column(
            "purpose_canonical",
            new_column_name="purpose",
            existing_type=sa.String(length=32),
            type_=sa.Enum("OUTAGE_STATUS", "RECOVERY_CONFIRMATION", name="statuscheckpurpose"),
            nullable=False,
        )


def _downgrade_contract_enums(bind) -> None:
    if bind.dialect.name == "postgresql":
        _replace_postgresql_enum(
            table_name="patient_responses",
            column_name="response_type",
            current_type_name="patientresponsetype",
            replacement_type_name="patientresponsetype_ab_legacy",
            replacement_values=("OK", "NEED_HELP", "EQUIPMENT_ISSUE"),
            value_expression="CASE response_type::text WHEN 'NORMAL' THEN 'OK' ELSE response_type::text END",
        )
        _replace_postgresql_enum(
            table_name="status_checks",
            column_name="purpose",
            current_type_name="statuscheckpurpose",
            replacement_type_name="statuscheckpurpose_ab_legacy",
            replacement_values=("OUTAGE_CHECK", "RECOVERY_CHECK"),
            value_expression=(
                "CASE purpose::text "
                "WHEN 'OUTAGE_STATUS' THEN 'OUTAGE_CHECK' "
                "WHEN 'RECOVERY_CONFIRMATION' THEN 'RECOVERY_CHECK' "
                "ELSE purpose::text END"
            ),
        )
        return

    with op.batch_alter_table("patient_responses") as batch_op:
        batch_op.add_column(sa.Column("response_type_legacy", sa.String(length=32), nullable=True))
    bind.execute(sa.text("UPDATE patient_responses SET response_type_legacy = CASE response_type WHEN 'NORMAL' THEN 'OK' ELSE response_type END"))
    with op.batch_alter_table("patient_responses") as batch_op:
        batch_op.drop_column("response_type")
        batch_op.alter_column("response_type_legacy", new_column_name="response_type", existing_type=sa.String(length=32), nullable=False)

    with op.batch_alter_table("status_checks") as batch_op:
        batch_op.add_column(sa.Column("purpose_legacy", sa.String(length=32), nullable=True))
    bind.execute(sa.text("UPDATE status_checks SET purpose_legacy = CASE purpose WHEN 'OUTAGE_STATUS' THEN 'OUTAGE_CHECK' WHEN 'RECOVERY_CONFIRMATION' THEN 'RECOVERY_CHECK' ELSE purpose END"))
    with op.batch_alter_table("status_checks") as batch_op:
        batch_op.drop_column("purpose")
        batch_op.alter_column("purpose_legacy", new_column_name="purpose", existing_type=sa.String(length=32), nullable=False)


def _ensure_safe_downgrade(bind) -> None:
    impact_cases = sa.table(
        "impact_cases",
        sa.column("risk_level", sa.String(length=16)),
        sa.column("effective_runtime_minutes", sa.Float()),
    )
    null_risk_count = bind.scalar(
        sa.select(sa.func.count()).select_from(impact_cases).where(impact_cases.c.risk_level.is_(None))
    )
    fractional_runtime_count = bind.scalar(
        sa.select(sa.func.count()).select_from(impact_cases).where(
            impact_cases.c.effective_runtime_minutes.is_not(None),
            impact_cases.c.effective_runtime_minutes != sa.cast(impact_cases.c.effective_runtime_minutes, sa.Integer()),
        )
    )
    if null_risk_count or fractional_runtime_count:
        raise RuntimeError(
            "0004 downgrade requires every impact case to have risk_level and integer-valued "
            "effective_runtime_minutes; resolve incompatible rows before retrying"
        )


def upgrade() -> None:
    bind = op.get_bind()
    policy = sa.table(
        "risk_policies",
        sa.column("id", sa.String(length=36)),
        sa.column("name", sa.String(length=100)),
        sa.column("rules", sa.JSON()),
    )
    bind.execute(
        policy.update()
        .where(policy.c.id == "00000000-0000-0000-0000-000000000001")
        .values(
            name="DEMO_ONLY_DEFAULT",
            rules={
                "responseTimeoutSeconds": 10,
                "watchRatioThreshold": 0.5,
                "criticalRatioThreshold": 0.2,
                "notice": "의료 기준이 아닌 시연 정책",
            },
        )
    )

    with op.batch_alter_table("impact_cases") as batch_op:
        batch_op.alter_column(
            "risk_level",
            existing_type=sa.Enum("WATCH", "HIGH", "CRITICAL", name="risklevel"),
            nullable=True,
        )
        batch_op.alter_column(
            "effective_runtime_minutes",
            existing_type=sa.Integer(),
            type_=sa.Float(),
            existing_nullable=True,
        )

    _upgrade_contract_enums(bind)


def downgrade() -> None:
    bind = op.get_bind()
    # 0003 cannot represent nullable risk or fractional runtime. Refuse the
    # downgrade before any DDL rather than inventing risk or rounding data.
    _ensure_safe_downgrade(bind)
    _downgrade_contract_enums(bind)

    with op.batch_alter_table("impact_cases") as batch_op:
        batch_op.alter_column(
            "risk_level",
            existing_type=sa.Enum("WATCH", "HIGH", "CRITICAL", name="risklevel"),
            nullable=False,
        )
        batch_op.alter_column(
            "effective_runtime_minutes",
            existing_type=sa.Float(),
            type_=sa.Integer(),
            existing_nullable=True,
            postgresql_using="effective_runtime_minutes::integer",
        )

    policy = sa.table(
        "risk_policies",
        sa.column("id", sa.String(length=36)),
        sa.column("name", sa.String(length=100)),
        sa.column("rules", sa.JSON()),
    )
    bind.execute(
        policy.update()
        .where(policy.c.id == "00000000-0000-0000-0000-000000000001")
        .values(
            name="DEMO_ONLY_DEFAULT",
            rules={
                "watch": "remainingRatio > 0.5",
                "high": "0.2 < remainingRatio <= 0.5",
                "critical": "remainingRatio <= 0.2",
                "notice": "의료 기준이 아닌 시연 정책",
            },
        )
    )
