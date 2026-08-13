from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import AuditLog, OutageEventHistory, Patient, RiskPolicy, UserRole
from app.security import create_access_token


POLICY_ID = "00000000-0000-0000-0000-000000000001"
SECOND_POLICY_ID = "00000000-0000-0000-0000-000000000002"
ADMIN_ID = "10000000-0000-0000-0000-000000000001"
CORE_ID = "20000000-0000-0000-0000-000000000001"
CASE_ID = "70000000-0000-0000-0000-000000000001"


def token(role: UserRole, subject: str) -> dict:
    value, _ = create_access_token(subject, role)
    return {"Authorization": f"Bearer {value}"}


def idem(auth: dict, key: str) -> dict:
    return {**auth, "Idempotency-Key": key}


def setup_function():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.add(RiskPolicy(id=POLICY_ID, name="DEMO_ONLY_DEFAULT", version=1, is_demo_only=True, rules={
            "responseTimeoutSeconds": 10, "watchRatioThreshold": 0.5, "criticalRatioThreshold": 0.2,
        }))
        db.add(RiskPolicy(id=SECOND_POLICY_ID, name="SECOND_TEST_POLICY", version=1, is_demo_only=True, rules={"notice": "snapshot mismatch test"}))
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


def case_body(status="PREPARE", risk=None, runtime=None, unknown="OUTAGE_NOT_STARTED", case_id=CASE_ID):
    return {
        "id": case_id,
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
        assert case["id"] == CASE_ID
        assert case["status"] == "PREPARE"
        assert case["riskLevel"] is None
        assert case["runtimeUnknownReason"] is not None

        repeated = client.post(f"/api/v1/outages/{outage['id']}/impact-cases", json=case_body(), headers=idem(core, "case-create-01"))
        assert repeated.status_code == 201
        assert repeated.json()["data"]["id"] == case["id"]
        duplicate = client.post(f"/api/v1/outages/{outage['id']}/impact-cases", json=case_body(), headers=idem(core, "case-create-02"))
        assert duplicate.status_code == 409
        assert duplicate.json()["error"]["code"] == "IMPACT_CASE_ALREADY_EXISTS"

        direct_case_close = client.post(
            f"/api/v1/impact-cases/{case['id']}/transitions",
            json={"next_status": "CLOSED", "version": case["version"], "reason": "잘못된 직접 종료"},
            headers=idem(core, "case-direct-close-01"),
        )
        assert direct_case_close.status_code == 409
        assert direct_case_close.json()["error"]["code"] == "IMPACT_CASE_NOT_READY_TO_CLOSE"

        scheduled_close = client.post(
            f"/api/v1/outages/{outage['id']}/close",
            json={"version": outage["version"], "reason": "잘못된 직접 종료"},
            headers=idem(core, "scheduled-direct-close-01"),
        )
        assert scheduled_close.status_code == 409
        assert scheduled_close.json()["error"]["code"] == "OUTAGE_NOT_RECOVERY_REPORTED"

        activated = client.post(
            f"/api/v1/outages/{outage['id']}/activate",
            json={"version": outage["version"], "reason": "실제 정전 시작", "occurred_at": "2026-08-14T03:00:00Z"},
            headers=idem(admin, "outage-activate-01"),
        )
        assert activated.status_code == 200
        assert activated.json()["data"]["status"] == "ACTIVE"

        active_close = client.post(
            f"/api/v1/outages/{outage['id']}/close",
            json={"version": activated.json()["data"]["version"], "reason": "잘못된 직접 종료"},
            headers=idem(core, "active-direct-close-01"),
        )
        assert active_close.status_code == 409
        assert active_close.json()["error"]["code"] == "OUTAGE_NOT_RECOVERY_REPORTED"

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
        assert transitioned.json()["data"]["riskLevel"] is None

    with SessionLocal() as db:
        histories = db.scalars(select(OutageEventHistory)).all()
        assert len(histories) == 2
        assert all(history.actor_role == UserRole.INSTITUTION_ADMIN for history in histories)
        assert len(db.scalars(select(AuditLog)).all()) >= 4


def test_unplanned_active_risk_result_and_validation():
    admin, core = token(UserRole.INSTITUTION_ADMIN, ADMIN_ID), token(UserRole.CORE_ENGINE, CORE_ID)
    body = {**scheduled_body(), "title": "비예고 정전", "outage_type": "UNPLANNED", "scheduled_start_at": None, "started_at": "2026-08-14T04:00:00Z"}
    with TestClient(app) as client:
        outage = client.post("/api/v1/outages", json=body, headers=idem(admin, "outage-create-02")).json()["data"]
        assert outage["status"] == "ACTIVE"

        direct_closed_case = client.post(
            f"/api/v1/outages/{outage['id']}/impact-cases",
            json=case_body("CLOSED", "HIGH", 180, None, "70000000-0000-0000-0000-000000000002"),
            headers=idem(core, "case-create-closed-01"),
        )
        assert direct_closed_case.status_code == 409
        assert direct_closed_case.json()["error"]["code"] == "INVALID_INITIAL_CASE_STATUS"

        case_payload = case_body("WAITING_PATIENT", "WATCH", 180.5, None)
        case = client.post(f"/api/v1/outages/{outage['id']}/impact-cases", json=case_payload, headers=idem(core, "case-create-03")).json()["data"]
        assert case["effectiveRuntimeMinutes"] == 180.5
        risk = client.post(
            f"/api/v1/impact-cases/{case['id']}/risk-results",
            json={
                "policyId": POLICY_ID, "policyVersion": 1,
                "risk_level": "CRITICAL", "effective_runtime_minutes": 180,
                "runtime_unknown_reason": None, "response_due_at": "2026-08-14T04:00:10Z",
                "risk_calculated_at": datetime.now(timezone.utc).isoformat(),
                "risk_reason": "남은 안전시간 비율 20% 이하", "version": case["version"],
            },
            headers=idem(core, "risk-result-01"),
        )
        assert risk.status_code == 200, risk.text
        assert risk.json()["data"]["riskLevel"] == "CRITICAL"
        assert risk.json()["data"]["riskPolicyId"] == POLICY_ID
        assert risk.json()["data"]["riskPolicyVersion"] == 1
        assert risk.json()["data"]["status"] == "WAITING_PATIENT"

        policy_mismatch = client.post(
            f"/api/v1/impact-cases/{case['id']}/risk-results",
            json={
                "policyId": SECOND_POLICY_ID, "policyVersion": 1,
                "risk_level": "HIGH", "effective_runtime_minutes": 120, "runtime_unknown_reason": None,
                "response_due_at": None, "risk_calculated_at": datetime.now(timezone.utc).isoformat(),
                "risk_reason": "다른 정책 결과", "version": risk.json()["data"]["version"],
            },
            headers=idem(core, "risk-policy-mismatch-01"),
        )
        assert policy_mismatch.status_code == 409
        assert policy_mismatch.json()["error"]["code"] == "IMPACT_CASE_POLICY_MISMATCH"

        missing_policy = client.post(
            f"/api/v1/impact-cases/{case['id']}/risk-results",
            json={
                "policyId": "00000000-0000-0000-0000-000000000099", "policyVersion": 1,
                "risk_level": "HIGH", "effective_runtime_minutes": 120, "runtime_unknown_reason": None,
                "response_due_at": None, "risk_calculated_at": datetime.now(timezone.utc).isoformat(),
                "risk_reason": "존재하지 않는 정책", "version": risk.json()["data"]["version"],
            },
            headers=idem(core, "risk-policy-missing-01"),
        )
        assert missing_policy.status_code == 409
        assert missing_policy.json()["error"]["code"] == "RISK_POLICY_NOT_FOUND"

        policy_version_mismatch = client.post(
            f"/api/v1/impact-cases/{case['id']}/risk-results",
            json={
                "policyId": POLICY_ID, "policyVersion": 2,
                "risk_level": "HIGH", "effective_runtime_minutes": 120, "runtime_unknown_reason": None,
                "response_due_at": None, "risk_calculated_at": datetime.now(timezone.utc).isoformat(),
                "risk_reason": "잘못된 정책 버전", "version": risk.json()["data"]["version"],
            },
            headers=idem(core, "risk-policy-version-01"),
        )
        assert policy_version_mismatch.status_code == 409
        assert policy_version_mismatch.json()["error"]["code"] == "RISK_POLICY_VERSION_MISMATCH"

        stale = client.post(
            f"/api/v1/impact-cases/{case['id']}/risk-results",
            json={
                "policyId": POLICY_ID, "policyVersion": 1,
                "risk_level": "HIGH", "effective_runtime_minutes": 180, "runtime_unknown_reason": None,
                "response_due_at": None, "risk_calculated_at": datetime.now(timezone.utc).isoformat(),
                "risk_reason": "stale", "version": case["version"],
            },
            headers=idem(core, "risk-result-02"),
        )
        assert stale.status_code == 409
