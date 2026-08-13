from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import (
    DisasterType, ImpactCase, ImpactCaseStatus, OperationMode, OutageEvent,
    OutageStatus, OutageType, Patient, RiskPolicy, UserRole,
)
from app.push.templates import DISASTER_PUSH_TEMPLATES
from app.security import create_access_token


PATIENT_ID = "30000000-0000-4000-8000-000000000001"
CORE_ID = "20000000-0000-4000-8000-000000000001"
POLICY_ID = "00000000-0000-0000-0000-000000000001"


def headers(role: UserRole, subject: str, idempotency_key: str | None = None) -> dict[str, str]:
    token, _ = create_access_token(subject, role)
    result = {"Authorization": f"Bearer {token}"}
    if idempotency_key:
        result["Idempotency-Key"] = idempotency_key
    return result


def setup_function():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.add(RiskPolicy(id=POLICY_ID, name="DEMO_ONLY_DEFAULT", version=1, is_demo_only=True, rules={}))
        db.add(Patient(id=PATIENT_ID, name="푸시환자", phone="01012345678", address="테스트", region_code="11140", diagnosis="호흡기", electronic_devices=[]))
        db.commit()


def seed_case(disaster_type: DisasterType) -> str:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        outage = OutageEvent(
            title="재난 알림", outage_type=OutageType.UNPLANNED, disaster_type=disaster_type,
            mode=OperationMode.TEST, status=OutageStatus.ACTIVE, region_codes=["11140"],
            started_at=now, created_by=CORE_ID,
        )
        db.add(outage)
        db.flush()
        case = ImpactCase(
            outage_id=outage.id, patient_id=PATIENT_ID, status=ImpactCaseStatus.PREPARE,
            risk_policy_id=POLICY_ID, risk_policy_version=1,
            risk_calculated_at=now, risk_reason="푸시 통합 테스트",
        )
        db.add(case)
        db.commit()
        return case.id


def test_patient_registers_device_and_core_sends_deduplicated_test_push():
    case_id = seed_case(DisasterType.FIRE)
    with TestClient(app) as client:
        registered = client.post(
            "/api/v1/push/devices",
            json={"token": "ExponentPushToken[test-patient-device]", "platform": "ANDROID"},
            headers=headers(UserRole.PATIENT, PATIENT_ID),
        )
        assert registered.status_code == 201, registered.text
        request = {"notification_type": "DISASTER_ALERT", "recipient_id": PATIENT_ID, "recipient_role": "PATIENT", "escalation_round": 0}
        first = client.post(
            f"/api/v1/core/impact-cases/{case_id}/push-notifications",
            json=request,
            headers=headers(UserRole.CORE_ENGINE, CORE_ID, "push-fire-case-01"),
        )
        assert first.status_code == 201, first.text
        delivery = first.json()["data"]
        assert delivery["status"] == "ACCEPTED"
        assert delivery["provider"] == "MOCK"
        assert delivery["disasterType"] == "FIRE"
        assert delivery["title"] == "화재 재난 알림"
        assert delivery["duplicate"] is False

        duplicate = client.post(
            f"/api/v1/core/impact-cases/{case_id}/push-notifications",
            json=request,
            headers=headers(UserRole.CORE_ENGINE, CORE_ID, "push-fire-case-02"),
        )
        assert duplicate.status_code == 201
        assert duplicate.json()["data"]["id"] == delivery["id"]
        assert duplicate.json()["data"]["duplicate"] is True


@pytest.mark.parametrize("disaster_type", [DisasterType.TYPHOON, DisasterType.EARTHQUAKE, DisasterType.COLD_WAVE, DisasterType.FIRE])
def test_four_disaster_types_have_short_push_templates(disaster_type):
    title, body = DISASTER_PUSH_TEMPLATES[disaster_type]
    assert 1 <= len(title) <= 20
    assert 1 <= len(body) <= 100


def test_unlinked_or_unregistered_recipient_is_rejected():
    case_id = seed_case(DisasterType.TYPHOON)
    with TestClient(app) as client:
        unlinked = client.post(
            f"/api/v1/core/impact-cases/{case_id}/push-notifications",
            json={"recipient_id": "50000000-0000-4000-8000-000000000001", "recipient_role": "GUARDIAN"},
            headers=headers(UserRole.CORE_ENGINE, CORE_ID, "push-unlinked-01"),
        )
        assert unlinked.status_code == 409
        assert unlinked.json()["error"]["code"] == "PUSH_RECIPIENT_NOT_LINKED"

        no_device = client.post(
            f"/api/v1/core/impact-cases/{case_id}/push-notifications",
            json={"recipient_id": PATIENT_ID, "recipient_role": "PATIENT"},
            headers=headers(UserRole.CORE_ENGINE, CORE_ID, "push-no-device-01"),
        )
        assert no_device.status_code == 409
        assert no_device.json()["error"]["code"] == "PUSH_DEVICE_NOT_REGISTERED"


def test_push_is_blocked_when_disaster_is_not_active():
    case_id = seed_case(DisasterType.EARTHQUAKE)
    with SessionLocal() as db:
        case = db.get(ImpactCase, case_id)
        case.outage.status = OutageStatus.RECOVERY_REPORTED
        db.commit()
    with TestClient(app) as client:
        response = client.post(
            f"/api/v1/core/impact-cases/{case_id}/push-notifications",
            json={"recipient_id": PATIENT_ID, "recipient_role": "PATIENT"},
            headers=headers(UserRole.CORE_ENGINE, CORE_ID, "push-inactive-01"),
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "PUSH_OUTAGE_NOT_ACTIVE"
