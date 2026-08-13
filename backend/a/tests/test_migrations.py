import importlib.util
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.models import (
    ImpactCase,
    ImpactCaseStatus,
    OperationMode,
    OutageEvent,
    OutageStatus,
    OutageType,
    Patient,
    RiskLevel,
)


BACKEND_A = Path(__file__).resolve().parents[1]
MIGRATION_0004 = BACKEND_A / "migrations" / "versions" / "0004_ab_contract_alignment.py"
POLICY_ID = "00000000-0000-0000-0000-000000000001"


def migrate(database_url: str, command: str, revision: str) -> None:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = database_url
    subprocess.run(
        [sys.executable, "-m", "alembic", command, revision],
        cwd=BACKEND_A,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def upgrade(database_url: str, revision: str) -> None:
    migrate(database_url, "upgrade", revision)


def test_sqlite_empty_database_upgrades_to_head(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'empty.db'}"
    upgrade(database_url, "head")

    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0004_ab_contract_alignment"


def test_sqlite_legacy_database_upgrades_canonical_enum_data(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'legacy.db'}"
    upgrade(database_url, "0003_response_recovery")
    engine = create_engine(database_url)
    now = datetime.now(timezone.utc)

    with Session(engine) as session:
        session.add(Patient(
            id="40000000-0000-0000-0000-000000000001",
            name="legacy patient",
            phone="01000000000",
            address="legacy address",
            region_code="11140",
            diagnosis="legacy diagnosis",
            electronic_devices=[],
        ))
        session.add(OutageEvent(
            id="60000000-0000-0000-0000-000000000001",
            title="legacy outage",
            outage_type=OutageType.UNPLANNED,
            mode=OperationMode.TEST,
            status=OutageStatus.ACTIVE,
            region_codes=["11140"],
            created_by="10000000-0000-0000-0000-000000000001",
        ))
        session.add(ImpactCase(
            id="70000000-0000-0000-0000-000000000001",
            outage_id="60000000-0000-0000-0000-000000000001",
            patient_id="40000000-0000-0000-0000-000000000001",
            status=ImpactCaseStatus.WAITING_PATIENT,
            risk_level=RiskLevel.HIGH,
            risk_policy_id=POLICY_ID,
            risk_policy_version=1,
            effective_runtime_minutes=120,
            risk_calculated_at=now,
            risk_reason="legacy result",
        ))
        session.commit()

    with engine.begin() as connection:
        check_values = {
            "case_id": "70000000-0000-0000-0000-000000000001",
            "requested_at": now,
            "provider_accepted_at": now,
            "response_due_at": now,
            "token_expires_at": now,
            "created_at": now,
            "version": 1,
        }
        connection.execute(text(
            "INSERT INTO status_checks "
            "(id, impact_case_id, purpose, status, token_digest, requested_at, provider_accepted_at, "
            "response_due_at, token_expires_at, created_at, version) "
            "VALUES (:id, :case_id, :purpose, :status, :token_digest, :requested_at, :provider_accepted_at, "
            ":response_due_at, :token_expires_at, :created_at, :version)"
        ), [
            check_values | {
                "id": "80000000-0000-0000-0000-000000000001",
                "purpose": "OUTAGE_CHECK",
                "status": "RESPONDED",
                "token_digest": "a" * 64,
            },
            check_values | {
                "id": "80000000-0000-0000-0000-000000000002",
                "purpose": "RECOVERY_CHECK",
                "status": "PENDING",
                "token_digest": "b" * 64,
            },
        ])
        connection.execute(text(
            "INSERT INTO patient_responses (id, status_check_id, response_type, responded_at) "
            "VALUES (:id, :status_check_id, 'OK', :responded_at)"
        ), {
            "id": "90000000-0000-0000-0000-000000000001",
            "status_check_id": "80000000-0000-0000-0000-000000000001",
            "responded_at": now,
        })

    upgrade(database_url, "head")

    with engine.connect() as connection:
        response_types = connection.execute(text("SELECT response_type FROM patient_responses")).scalars().all()
        purposes = connection.execute(text("SELECT purpose FROM status_checks ORDER BY id")).scalars().all()
        policy_rules = connection.execute(text("SELECT rules FROM risk_policies WHERE id = :id"), {"id": POLICY_ID}).scalar_one()
    assert response_types == ["NORMAL"]
    assert purposes == ["OUTAGE_STATUS", "RECOVERY_CONFIRMATION"]
    assert '"responseTimeoutSeconds": 10' in policy_rules

    migrate(database_url, "downgrade", "0003_response_recovery")
    with engine.connect() as connection:
        response_types = connection.execute(text("SELECT response_type FROM patient_responses")).scalars().all()
        purposes = connection.execute(text("SELECT purpose FROM status_checks ORDER BY id")).scalars().all()
        policy_rules = connection.execute(text("SELECT rules FROM risk_policies WHERE id = :id"), {"id": POLICY_ID}).scalar_one()
    assert response_types == ["OK"]
    assert purposes == ["OUTAGE_CHECK", "RECOVERY_CHECK"]
    assert '"watch": "remainingRatio > 0.5"' in policy_rules


def test_postgresql_enum_upgrade_uses_replacement_types_and_legacy_casts(monkeypatch):
    spec = importlib.util.spec_from_file_location("migration_0004", MIGRATION_0004)
    migration = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(migration)
    statements = []
    monkeypatch.setattr(migration.op, "execute", lambda statement: statements.append(str(statement)))

    migration._upgrade_contract_enums(SimpleNamespace(dialect=SimpleNamespace(name="postgresql")))

    sql = "\n".join(statements)
    assert "CREATE TYPE patientresponsetype_ab_v2 AS ENUM ('NORMAL', 'NEED_HELP', 'EQUIPMENT_ISSUE')" in sql
    assert "WHEN 'OK' THEN 'NORMAL'" in sql
    assert "DROP TYPE patientresponsetype" in sql
    assert "ALTER TYPE patientresponsetype_ab_v2 RENAME TO patientresponsetype" in sql
    assert "CREATE TYPE statuscheckpurpose_ab_v2 AS ENUM ('OUTAGE_STATUS', 'RECOVERY_CONFIRMATION')" in sql
    assert "WHEN 'OUTAGE_CHECK' THEN 'OUTAGE_STATUS'" in sql
    assert "WHEN 'RECOVERY_CHECK' THEN 'RECOVERY_CONFIRMATION'" in sql
    assert "ALTER TYPE statuscheckpurpose_ab_v2 RENAME TO statuscheckpurpose" in sql


def test_downgrade_refuses_null_risk_or_fractional_runtime(tmp_path):
    spec = importlib.util.spec_from_file_location("migration_0004_safety", MIGRATION_0004)
    migration = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(migration)
    engine = create_engine(f"sqlite:///{tmp_path / 'unsafe-downgrade.db'}")
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE impact_cases (risk_level VARCHAR(16), effective_runtime_minutes FLOAT)"
        ))
        connection.execute(text(
            "INSERT INTO impact_cases (risk_level, effective_runtime_minutes) "
            "VALUES (NULL, 10), ('HIGH', 10.5)"
        ))
        with pytest.raises(RuntimeError, match="resolve incompatible rows"):
            migration._ensure_safe_downgrade(connection)
