from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import (
    AuditLog, EmergencyContact, Guardian, GuardianPatient, ImpactCase, ImpactCaseStatus, OperationMode,
    OutageEvent, OutageEventHistory, OutageStatus, OutageType, Patient, PatientResponse, RiskLevel, RiskPolicy,
    GuardianAction, StatusCheck, StatusCheckStatus, UserRole,
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
    "check": "80000000-0000-0000-0000-000000000001",
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
        db.add(RiskPolicy(id=IDS["policy"], name="DEMO_ONLY_DEFAULT", version=1, is_demo_only=True, rules={
            "responseTimeoutSeconds": 10, "watchRatioThreshold": 0.5, "criticalRatioThreshold": 0.2,
        }))
        guardian = Guardian(id=IDS["guardian"], name="보호자", phone="01011112222", password_hash=hash_password("password-1"))
        patient = Patient(id=IDS["patient"], name="환자", phone="01033334444", address="서울 중구", region_code="11140", diagnosis="호흡기", electronic_devices=[])
        db.add_all([guardian, patient])
        db.flush()
        db.add(GuardianPatient(guardian_id=guardian.id, patient_id=patient.id, priority=1))
        db.add(EmergencyContact(id=IDS["contact"], patient_id=patient.id, guardian_id=guardian.id, name=guardian.name, phone=guardian.phone, relationship="자녀", priority=1))
        db.add(OutageEvent(id=IDS["outage"], title="TEST 정전", outage_type=OutageType.UNPLANNED, mode=OperationMode.TEST, status=OutageStatus.ACTIVE, region_codes=["11140"], started_at=now, created_by=IDS["admin"]))
        db.add(ImpactCase(id=IDS["case"], outage_id=IDS["outage"], patient_id=patient.id, status=ImpactCaseStatus.WAITING_PATIENT, risk_level=RiskLevel.HIGH, risk_policy_id=IDS["policy"], risk_policy_version=1, effective_runtime_minutes=120, risk_calculated_at=now, risk_reason="DEMO 계산"))
        db.commit()


def check_body(token, purpose="OUTAGE_STATUS", due_delta=10, check_id=IDS["check"]):
    now = datetime.now(timezone.utc)
    accepted_at = now - timedelta(seconds=1)
    due_at = accepted_at + timedelta(seconds=due_delta)
    return {
        "id": check_id,
        "purpose": purpose,
        "token": token,
        "requested_at": accepted_at.isoformat(),
        "provider_accepted_at": accepted_at.isoformat(),
        "response_due_at": due_at.isoformat(),
        "token_expires_at": due_at.isoformat(),
    }


def test_patient_response_token_once_and_guardian_action():
    core = auth(UserRole.CORE_ENGINE, IDS["core"], "register-check-01")
    plain_token = "patient-outage-token-1234567890"
    with TestClient(app) as client:
        registered = client.post(f"/api/v1/impact-cases/{IDS['case']}/status-checks", json=check_body(plain_token, "OUTAGE_CHECK"), headers=core)
        assert registered.status_code == 201, registered.text
        assert registered.json()["data"]["id"] == IDS["check"]
        assert registered.json()["data"]["purpose"] == "OUTAGE_STATUS"

        duplicate_id = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/status-checks",
            json=check_body("another-patient-token-123456789", "OUTAGE_STATUS"),
            headers=auth(UserRole.CORE_ENGINE, IDS["core"], "register-check-duplicate-id-01"),
        )
        assert duplicate_id.status_code == 409
        assert duplicate_id.json()["error"]["code"] == "STATUS_CHECK_ID_ALREADY_EXISTS"

        responded = client.post(f"/api/v1/public/check-ins/{plain_token}/responses", json={"response_type": "OK"})
        assert responded.status_code == 200
        assert responded.json()["data"]["responseType"] == "NORMAL"
        assert responded.json()["data"]["purpose"] == "OUTAGE_STATUS"
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

        completed = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/guardian-actions",
            json={"emergency_contact_id": IDS["contact"], "status": "COMPLETED", "escalation_round": 1, "note": "전원 연결 완료", "acted_at": datetime.now(timezone.utc).isoformat()},
            headers=auth(UserRole.GUARDIAN, IDS["guardian"], "guardian-action-completed-01"),
        )
        assert completed.status_code == 201, completed.text
        assert completed.json()["data"]["status"] == "COMPLETED"

    with SessionLocal() as db:
        assert db.scalar(select(StatusCheck)).status == StatusCheckStatus.RESPONDED
        assert db.scalar(select(PatientResponse)).response_type.value == "NORMAL"
        actions = db.scalars(select(GuardianAction)).all()
        assert len(actions) == 1
        assert actions[0].status.value == "COMPLETED"


def test_logged_in_patient_response_uses_pending_status_check():
    with TestClient(app) as client:
        registered = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/status-checks",
            json=check_body("authenticated-patient-token-123456"),
            headers=auth(UserRole.CORE_ENGINE, IDS["core"], "register-authenticated-check-01"),
        )
        assert registered.status_code == 201, registered.text

        responded = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/patient-responses",
            json={"response_type": "NEED_HELP", "note": "보호자 도움이 필요합니다."},
            headers=auth(UserRole.PATIENT, IDS["patient"], "patient-response-01"),
        )
        assert responded.status_code == 201, responded.text
        assert responded.json()["data"]["responseType"] == "NEED_HELP"

        repeated = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/patient-responses",
            json={"response_type": "NEED_HELP"},
            headers=auth(UserRole.PATIENT, IDS["patient"], "patient-response-02"),
        )
        assert repeated.status_code == 404
        assert repeated.json()["error"]["code"] == "PENDING_STATUS_CHECK_NOT_FOUND"


def test_response_plan_is_saved_and_visible_to_linked_accounts():
    plan = {
        "status": "PROPOSED",
        "reviewRequired": True,
        "policyVersion": "DISASTER_RESPONSE_PLAN_V1",
        "actions": [{"code": "CHECK_DEVICE_POWER", "instructionKo": "의료기기 전원 상태를 확인하세요."}],
        "narrative": "의료기기 전원 상태를 확인하세요.",
        "narrativeSource": "AI",
        "model": "gemini-test",
        "requestId": "request-1",
        "fallbackReason": None,
    }
    with TestClient(app) as client:
        saved = client.put(
            f"/api/v1/impact-cases/{IDS['case']}/response-plan",
            json=plan,
            headers=auth(UserRole.CORE_ENGINE, IDS["core"], "response-plan-save-01"),
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["data"]["responsePlan"] == plan

        patient_view = client.get(
            f"/api/v1/patients/{IDS['patient']}/current-impact-case",
            headers=auth(UserRole.PATIENT, IDS["patient"]),
        )
        assert patient_view.status_code == 200, patient_view.text
        assert patient_view.json()["data"]["impactCase"]["responsePlan"] == plan
        assert patient_view.json()["data"]["outage"]["id"] == IDS["outage"]

        guardian_view = client.get(
            f"/api/v1/patients/{IDS['patient']}/current-impact-case",
            headers=auth(UserRole.GUARDIAN, IDS["guardian"]),
        )
        assert guardian_view.status_code == 200, guardian_view.text


def test_current_case_uses_latest_status_check_deadline():
    due_at = datetime.now(timezone.utc) + timedelta(minutes=3)
    with SessionLocal() as db:
        db.add(StatusCheck(
            id=IDS["check"], impact_case_id=IDS["case"], purpose="OUTAGE_STATUS",
            status=StatusCheckStatus.PENDING, token_digest="b" * 64,
            requested_at=due_at - timedelta(minutes=1),
            provider_accepted_at=due_at - timedelta(minutes=1),
            response_due_at=due_at, token_expires_at=due_at,
        ))
        db.commit()

    with TestClient(app) as client:
        response = client.get(
            f"/api/v1/patients/{IDS['patient']}/current-impact-case",
            headers=auth(UserRole.PATIENT, IDS["patient"]),
        )
        assert response.status_code == 200, response.text
        actual = datetime.fromisoformat(response.json()["data"]["impactCase"]["responseDueAt"])
        assert actual == due_at


def test_legacy_recovery_purpose_is_stored_and_returned_canonically():
    recovery_check_id = "80000000-0000-0000-0000-000000000002"
    with SessionLocal() as db:
        case = db.get(ImpactCase, IDS["case"])
        case.status = ImpactCaseStatus.RECOVERY_CHECK
        db.commit()

    with TestClient(app) as client:
        registered = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/status-checks",
            json=check_body("patient-recovery-token-123456789", "RECOVERY_CHECK", check_id=recovery_check_id),
            headers=auth(UserRole.CORE_ENGINE, IDS["core"], "legacy-recovery-purpose-01"),
        )
        assert registered.status_code == 201, registered.text
        assert registered.json()["data"]["id"] == recovery_check_id
        assert registered.json()["data"]["purpose"] == "RECOVERY_CONFIRMATION"

    with SessionLocal() as db:
        assert db.get(StatusCheck, recovery_check_id).purpose.value == "RECOVERY_CONFIRMATION"


def test_recovery_snapshot_requires_recovery_check_state():
    guardian_headers = auth(UserRole.GUARDIAN, IDS["guardian"], "recovery-invalid-prepare-01")
    body = {"home_power_restored": True, "device_operating_normally": True, "reason": "복구 확인"}

    with SessionLocal() as db:
        case = db.get(ImpactCase, IDS["case"])
        case.status = ImpactCaseStatus.PREPARE
        db.commit()
    with TestClient(app) as client:
        prepare = client.post(f"/api/v1/impact-cases/{IDS['case']}/recovery-confirmations", json=body, headers=guardian_headers)
        assert prepare.status_code == 409
        assert prepare.json()["error"]["code"] == "RECOVERY_CONFIRMATION_NOT_ALLOWED"

    with SessionLocal() as db:
        case = db.get(ImpactCase, IDS["case"])
        case.status = ImpactCaseStatus.CLOSED
        db.commit()
    with TestClient(app) as client:
        closed = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/recovery-confirmations",
            json=body,
            headers=auth(UserRole.GUARDIAN, IDS["guardian"], "recovery-invalid-closed-01"),
        )
        assert closed.status_code == 409
        assert closed.json()["error"]["code"] == "RECOVERY_CONFIRMATION_NOT_ALLOWED"

    with SessionLocal() as db:
        case = db.get(ImpactCase, IDS["case"])
        case.status = ImpactCaseStatus.RECOVERY_CHECK
        db.commit()
    with TestClient(app) as client:
        allowed = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/recovery-confirmations",
            json=body,
            headers=auth(UserRole.GUARDIAN, IDS["guardian"], "recovery-valid-01"),
        )
        assert allowed.status_code == 201, allowed.text
        assert allowed.json()["data"]["decisionPending"] is True


def test_core_can_report_regional_recovery_and_read_outage_cases():
    now = datetime.now(timezone.utc)
    core_headers = auth(UserRole.CORE_ENGINE, IDS["core"], "core-regional-recovery-01")
    with TestClient(app) as client:
        outage = client.get(
            f"/api/v1/outages/{IDS['outage']}",
            headers=auth(UserRole.CORE_ENGINE, IDS["core"]),
        )
        assert outage.status_code == 200, outage.text

        cases = client.get(
            f"/api/v1/outages/{IDS['outage']}/impact-cases",
            headers=auth(UserRole.CORE_ENGINE, IDS["core"]),
        )
        assert cases.status_code == 200, cases.text
        assert cases.json()["data"][0]["id"] == IDS["case"]

        recovery = client.post(
            f"/api/v1/core/outages/{IDS['outage']}/recovery",
            json={
                "version": outage.json()["data"]["version"],
                "recovered_at": now.isoformat(),
                "source": "관리자 복구 버튼",
                "reason": "Core 복구 워크플로 시작",
            },
            headers=core_headers,
        )
        assert recovery.status_code == 200, recovery.text
        assert recovery.json()["data"]["status"] == "RECOVERY_REPORTED"

    with SessionLocal() as db:
        history = db.scalar(
            select(OutageEventHistory).where(
                OutageEventHistory.next_status == OutageStatus.RECOVERY_REPORTED
            )
        )
        assert history.actor_role == UserRole.CORE_ENGINE


def test_core_decisions_are_persisted_without_a_recalculating_timeout_or_recovery_closure():
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        check = StatusCheck(
            impact_case_id=IDS["case"], purpose="OUTAGE_STATUS", status=StatusCheckStatus.PENDING,
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
            json={"version": check_version, "timed_out_at": (now - timedelta(seconds=10)).isoformat(), "reason": "B의 timeout 결정"},
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
        assert case["status"] == "WAITING_PATIENT"
        assert case["riskLevel"] == "HIGH"

        moved = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/transitions",
            json={"next_status": "RECOVERY_CHECK", "version": case["version"], "reason": "B의 지역 복구 결정"},
            headers=auth(UserRole.CORE_ENGINE, IDS["core"], "recovery-transition-01"),
        )
        assert moved.status_code == 200, moved.text

        false_confirmation = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/recovery-confirmations",
            json={"home_power_restored": True, "device_operating_normally": False, "reason": "기기 미복구"},
            headers=auth(UserRole.GUARDIAN, IDS["guardian"], "recovery-confirm-01"),
        )
        assert false_confirmation.status_code == 201
        assert false_confirmation.json()["data"]["caseClosed"] is False
        assert false_confirmation.json()["data"]["decisionPending"] is True

        final_confirmation = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/recovery-confirmations",
            json={"home_power_restored": True, "device_operating_normally": True, "reason": "현장 확인 완료"},
            headers=auth(UserRole.GUARDIAN, IDS["guardian"], "recovery-confirm-02"),
        )
        assert final_confirmation.status_code == 201, final_confirmation.text
        assert final_confirmation.json()["data"]["caseClosed"] is False
        assert final_confirmation.json()["data"]["decisionPending"] is True

        current_case = client.get(f"/api/v1/impact-cases/{IDS['case']}", headers=auth(UserRole.CORE_ENGINE, IDS["core"])).json()["data"]
        closed_case = client.post(
            f"/api/v1/impact-cases/{IDS['case']}/transitions",
            json={"next_status": "CLOSED", "version": current_case["version"], "reason": "B의 canCloseImpactCase 결정"},
            headers=auth(UserRole.CORE_ENGINE, IDS["core"], "case-close-01"),
        )
        assert closed_case.status_code == 200, closed_case.text

        current_outage = client.get(f"/api/v1/outages/{IDS['outage']}", headers=auth(UserRole.INSTITUTION_ADMIN, IDS["admin"])).json()["data"]
        closed_outage = client.post(
            f"/api/v1/outages/{IDS['outage']}/close",
            json={"version": current_outage["version"], "reason": "B의 canCloseOutage 결정", "occurred_at": now.isoformat()},
            headers=auth(UserRole.CORE_ENGINE, IDS["core"], "outage-close-01"),
        )
        assert closed_outage.status_code == 200, closed_outage.text
        outage = client.get(f"/api/v1/outages/{IDS['outage']}", headers=auth(UserRole.INSTITUTION_ADMIN, IDS["admin"])).json()["data"]
        assert outage["status"] == "CLOSED"

    with SessionLocal() as db:
        timed_out = db.get(StatusCheck, check_id)
        assert timed_out.status == StatusCheckStatus.TIMED_OUT
        assert timed_out.patient_response is None
        close_history = db.scalar(select(OutageEventHistory).where(OutageEventHistory.next_status == OutageStatus.CLOSED))
        assert close_history.actor_role == UserRole.CORE_ENGINE
        close_audit = db.scalar(
            select(AuditLog).where(
                AuditLog.entity_type == "OutageEvent",
                AuditLog.actor_id == IDS["core"],
                AuditLog.actor_role == UserRole.CORE_ENGINE,
            )
        )
        assert close_audit is not None
