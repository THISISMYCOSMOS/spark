from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import AuditLog, OutageEventHistory, Patient, RiskPolicy, UserRole
from app.security import create_access_token


POLICY_ID = "00000000-0000-0000-0000-000000000001"
ADMIN_ID = "10000000-0000-0000-0000-000000000001"
CORE_ID = "20000000-0000-0000-0000-000000000001"


def token(role: UserRole, subject: str) -> dict:
    value, _ = create_access_token(subject, role)
    return {"Authorization": f"Bearer {value}"}


def idem(auth: dict, key: str) -> dict:
    return {**auth, "Idempotency-Key": key}


def setup_function():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.add(RiskPolicy(id=POLICY_ID, name="DEMO_ONLY_DEFAULT", version=1, is_demo_only=True, rules={"notice": "DEMO_ONLY"}))
        db.add(Patient(id="30000000-0000-0000-0000-000000000001", name="영향환자", phone="01099990000", address="서울 중구", region_code="11140", diagnosis="호흡기", electronic_devices=[]))
        db.commit()


def scheduled_body():
    return {
        "title": "중구 예고 정전",
        "outage_type": "SCHEDULED",
        "mode": "TEST",
        "region_codes": ["11140"],
        "scheduled_start_at": "2026-08-14T03:00:00Z",
        "expected_end_at": "2026-08-14T05:00:00Z",
        "source": "DEMO",
        "reason": "통합 테스트",
    }


def case_body(status="PREPARE", risk="HIGH", runtime=None, unknown="배터리 검증값 누락"):
    return {
        "patient_id": "30000000-0000-0000-0000-000000000001",
        "status": status,
        "risk_level": risk,
        "risk_policy_id": POLICY_ID,
        "risk_policy_version": 1,
        "effective_runtime_minutes": runtime,
        "runtime_unknown_reason": unknown,
        "response_due_at": "2026-08-14T03:00:10Z",
        "risk_calculated_at": "2026-08-14T03:00:00Z",
        "risk_reason": "코어 엔진 계산 결과",
    }


def test_scheduled_outage_case_activation_and_guards():
    admin, core = token(UserRole.INSTITUTION_ADMIN, ADMIN_ID), token(UserRole.CORE_ENGINE, CORE_ID)
    with TestClient(app) as client:
        created = client.post("/api/v1/outages", json=scheduled_body(), headers=idem(admin, "outage-create-01"))
        assert created.status_code == 201, created.text
        outage = created.json()["data"]
        assert outage["status"] == "SCHEDULED"

        case_response = client.post(f"/api/v1/outages/{outage['id']}/impact-cases", json=case_body(), headers=idem(core, "case-create-01"))
        assert case_response.status_code == 201, case_response.text
        case = case_response.json()["data"]
        assert case["status"] == "PREPARE"
        assert case["riskLevel"] == "HIGH"
        assert case["runtimeUnknownReason"] is not None

        repeated = client.post(f"/api/v1/outages/{outage['id']}/impact-cases", json=case_body(), headers=idem(core, "case-create-01"))
        assert repeated.status_code == 201
        assert repeated.json()["data"]["id"] == case["id"]
        duplicate = client.post(f"/api/v1/outages/{outage['id']}/impact-cases", json=case_body(), headers=idem(core, "case-create-02"))
        assert duplicate.status_code == 409
        assert duplicate.json()["error"]["code"] == "IMPACT_CASE_ALREADY_EXISTS"

        activated = client.post(
            f"/api/v1/outages/{outage['id']}/activate",
            json={"version": outage["version"], "reason": "실제 정전 시작", "occurred_at": "2026-08-14T03:00:00Z"},
            headers=idem(admin, "outage-activate-01"),
        )
        assert activated.status_code == 200
        assert activated.json()["data"]["status"] == "ACTIVE"

        invalid = client.post(
            f"/api/v1/outages/{outage['id']}/cancel",
            json={"version": activated.json()["data"]["version"], "reason": "잘못된 취소"},
            headers=idem(admin, "outage-cancel-01"),
        )
        assert invalid.status_code == 409
        assert invalid.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

        transitioned = client.post(
            f"/api/v1/impact-cases/{case['id']}/transitions",
            json={"next_status": "WAITING_PATIENT", "version": case["version"], "reason": "상태 확인 요청"},
            headers=idem(core, "case-transition-01"),
        )
        assert transitioned.status_code == 200
        assert transitioned.json()["data"]["riskLevel"] == "HIGH"

    with SessionLocal() as db:
        assert len(db.scalars(select(OutageEventHistory)).all()) == 2
        assert len(db.scalars(select(AuditLog)).all()) >= 4


def test_unplanned_active_risk_result_and_validation():
    admin, core = token(UserRole.INSTITUTION_ADMIN, ADMIN_ID), token(UserRole.CORE_ENGINE, CORE_ID)
    body = {**scheduled_body(), "title": "비예고 정전", "outage_type": "UNPLANNED", "scheduled_start_at": None, "started_at": "2026-08-14T04:00:00Z"}
    with TestClient(app) as client:
        outage = client.post("/api/v1/outages", json=body, headers=idem(admin, "outage-create-02")).json()["data"]
        assert outage["status"] == "ACTIVE"

        invalid_watch = client.post(f"/api/v1/outages/{outage['id']}/impact-cases", json=case_body("WAITING_PATIENT", "WATCH"), headers=idem(core, "case-invalid-01"))
        assert invalid_watch.status_code == 422

        case_payload = case_body("WAITING_PATIENT", "WATCH", 180, None)
        case = client.post(f"/api/v1/outages/{outage['id']}/impact-cases", json=case_payload, headers=idem(core, "case-create-03")).json()["data"]
        risk = client.post(
            f"/api/v1/impact-cases/{case['id']}/risk-results",
            json={
                "risk_level": "CRITICAL", "effective_runtime_minutes": 180,
                "runtime_unknown_reason": None, "response_due_at": "2026-08-14T04:00:10Z",
                "risk_calculated_at": datetime.now(timezone.utc).isoformat(),
                "risk_reason": "남은 안전시간 비율 20% 이하", "version": case["version"],
            },
            headers=idem(core, "risk-result-01"),
        )
        assert risk.status_code == 200, risk.text
        assert risk.json()["data"]["riskLevel"] == "CRITICAL"
        assert risk.json()["data"]["status"] == "WAITING_PATIENT"

        stale = client.post(
            f"/api/v1/impact-cases/{case['id']}/risk-results",
            json={
                "risk_level": "HIGH", "effective_runtime_minutes": 180, "runtime_unknown_reason": None,
                "response_due_at": None, "risk_calculated_at": datetime.now(timezone.utc).isoformat(),
                "risk_reason": "stale", "version": case["version"],
            },
            headers=idem(core, "risk-result-02"),
        )
        assert stale.status_code == 409
