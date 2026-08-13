from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import (
    EmergencyContact, Guardian, GuardianPatient, ImpactCase, ImpactCaseStatus, OperationMode,
    OutageEvent, OutageStatus, OutageType, Patient, PatientResponse, RiskLevel, RiskPolicy,
    StatusCheck, StatusCheckStatus, UserRole,
)
from app.security import create_access_token, hash_password


IDS = {
    "policy": "00000000-0000-0000-0000-000000000001",
    "admin": "10000000-0000-0000-0000-000000000001",
    "core": "20000000-0000-0000-0000-000000000001",
    "guardian": "30000000-0000-0000-0000-000000000001",
    "patient": "40000000-0000-0000-0000-000000000001",
    "contact": "50000000-0000-0000-0000-000000000001",
    "outage": "60000000-0000-0000-0000-000000000001",
    "case": "70000000-0000-0000-0000-000000000001",
}


def auth(role, subject, key=None):
    token, _ = create_access_token(subject, role)
    result = {"Authorization": f"Bearer {token}"}
    if key: result["Idempotency-Key"] = key
    return result


def setup_function():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        db.add(RiskPolicy(id=IDS["policy"], name="DEMO_ONLY_DEFAULT", version=1, is_demo_only=True, rules={"notice": "DEMO_ONLY"}))
        guardian = Guardian(id=IDS["guardian"], name="보호자", phone="01011112222", password_hash=hash_password("password-1"))
        patient = Patient(id=IDS["patient"], name="환자", phone="01033334444", address="서울 중구", region_code="11140", diagnosis="호흡기", electronic_devices=[])
        db.add_all([guardian, patient])
        db.flush()
        db.add(GuardianPatient(guardian_id=guardian.id, patient_id=patient.id, priority=1))
        db.add(EmergencyContact(id=IDS["contact"], patient_id=patient.id, guardian_id=guardian.id, name=guardian.name, phone=guardian.phone, relationship="자녀", priority=1))
        db.add(OutageEvent(id=IDS["outage"], title="TEST 정전", outage_type=OutageType.UNPLANNED, mode=OperationMode.TEST, status=OutageStatus.ACTIVE, region_codes=["11140"], started_at=now, created_by=IDS["admin"]))
        db.add(ImpactCase(id=IDS["case"], outage_id=IDS["outage"], patient_id=patient.id, status=ImpactCaseStatus.WAITING_PATIENT, risk_level=RiskLevel.HIGH, risk_policy_id=IDS["policy"], risk_policy_version=1, effective_runtime_minutes=120, risk_calculated_at=now, risk_reason="DEMO 계산"))
        db.commit()


def check_body(token, purpose="OUTAGE_CHECK", due_delta=60):
    now = datetime.now(timezone.utc)
    return {
        "purpose": purpose,
        "token": token,
        "requested_at": (now - timedelta(seconds=2)).isoformat(),
        "provider_accepted_at": (now - timedelta(seconds=1)).isoformat(),
        "response_due_at": (now + timedelta(seconds=due_delta)).isoformat(),
        "token_expires_at": (now + timedelta(minutes=5)).isoformat(),
    }


def test_patient_response_token_once_and_guardian_action():
    core = auth(UserRole.CORE_ENGINE, IDS["core"], "register-check-01")
    plain_token = "patient-outage-token-1234567890"
    with TestClient(app) as client:
        registered = client.post(f"/api/v1/impact-cases/{IDS['case']}/status-checks", json=check_body(plain_token), headers=core)
        assert registered.status_code == 201, registered.text

        responded = client.post(f"/api/v1/public/check-ins/{plain_token}/responses", json={"response_type": "OK"})
        assert responded.status_code == 200
        reused = client.post(f"/api/v1/public/check-ins/{plain_token}/responses", json={"response_type": "OK"})
        assert reused.status_code == 410
        assert reused.json()["error"]["code"] == "CHECK_IN_TOKEN_ALREADY_USED"

        action = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/guardian-actions",
            json={"emergency_contact_id": IDS["contact"], "status": "ACTING", "escalation_round": 1, "note": "현장 이동", "acted_at": datetime.now(timezone.utc).isoformat()},
            headers=auth(UserRole.GUARDIAN, IDS["guardian"], "guardian-action-01"),
        )
        assert action.status_code == 201, action.text
        assert action.json()["data"]["status"] == "ACTING"

    with SessionLocal() as db:
        assert db.scalar(select(StatusCheck)).status == StatusCheckStatus.RESPONDED
        assert db.scalar(select(PatientResponse)) is not None


def test_timeout_has_no_response_and_full_recovery_closes_outage():
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        check = StatusCheck(
            impact_case_id=IDS["case"], purpose="OUTAGE_CHECK", status=StatusCheckStatus.PENDING,
            token_digest="a" * 64, requested_at=now - timedelta(seconds=20),
            provider_accepted_at=now - timedelta(seconds=19), response_due_at=now - timedelta(seconds=9),
            token_expires_at=now + timedelta(minutes=1),
        )
        db.add(check)
        db.commit()
        check_id, check_version = check.id, check.version

    with TestClient(app) as client:
        timeout = client.post(
            f"/api/v1/status-checks/{check_id}/timeout",
            json={"version": check_version, "timed_out_at": now.isoformat(), "reason": "10초 무응답"},
            headers=auth(UserRole.CORE_ENGINE, IDS["core"], "timeout-check-01"),
        )
        assert timeout.status_code == 200, timeout.text
        assert timeout.json()["data"]["status"] == "TIMED_OUT"

        recovery = client.post(
            f"/api/v1/outages/{IDS['outage']}/recovery",
            json={"version": 1, "recovered_at": now.isoformat(), "source": "관리자 지역 복구 신호", "reason": "지역 전력 복구"},
            headers=auth(UserRole.INSTITUTION_ADMIN, IDS["admin"], "regional-recovery-01"),
        )
        assert recovery.status_code == 200, recovery.text
        assert recovery.json()["data"]["status"] == "RECOVERY_REPORTED"

        case = client.get(f"/api/v1/impact-cases/{IDS['case']}", headers=auth(UserRole.CORE_ENGINE, IDS["core"])).json()["data"]
        assert case["status"] == "RECOVERY_CHECK"
        assert case["riskLevel"] == "HIGH"

        false_confirmation = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/recovery-confirmations",
            json={"home_power_restored": True, "device_operating_normally": False, "reason": "기기 미복구"},
            headers=auth(UserRole.GUARDIAN, IDS["guardian"], "recovery-confirm-01"),
        )
        assert false_confirmation.status_code == 201
        assert false_confirmation.json()["data"]["caseClosed"] is False

        final_confirmation = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/recovery-confirmations",
            json={"home_power_restored": True, "device_operating_normally": True, "reason": "현장 확인 완료"},
            headers=auth(UserRole.GUARDIAN, IDS["guardian"], "recovery-confirm-02"),
        )
        assert final_confirmation.status_code == 201, final_confirmation.text
        assert final_confirmation.json()["data"]["caseClosed"] is True
        outage = client.get(f"/api/v1/outages/{IDS['outage']}", headers=auth(UserRole.INSTITUTION_ADMIN, IDS["admin"])).json()["data"]
        assert outage["status"] == "CLOSED"

    with SessionLocal() as db:
        timed_out = db.get(StatusCheck, check_id)
        assert timed_out.status == StatusCheckStatus.TIMED_OUT
        assert timed_out.patient_response is None
