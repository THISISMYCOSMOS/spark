from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import AuditLog, EmergencyContact, MedicalDevice


SIGNUP = {
    "guardian_name": "김보호",
    "guardian_phone": "010-1111-2222",
    "password": "safe-password",
    "patient_name": "기존환자",
    "patient_phone": "010-2222-3333",
    "secondary_phone": None,
    "affiliated_institution": "행복복지관",
    "patient_address": "서울시 중구",
    "diagnosis": "호흡기 질환",
    "electronic_devices": ["산소발생기"],
}

PATIENT = {
    "name": "신규환자",
    "phone": "010-3333-4444",
    "secondary_phone": "02-123-4567",
    "affiliated_institution": "행복복지관",
    "address": "서울특별시 중구 세종대로 1",
    "address_detail": "101동 101호",
    "region_code": "11140",
    "diagnosis": "호흡기 질환",
    "power_profile": {
        "safety_margin_minutes": 30,
        "backup_power_runtime_minutes": 60,
        "backup_power_verified": True,
        "devices": [
            {
                "device_type": "가정용 인공호흡기",
                "model_name": "VENT-1",
                "battery_runtime_minutes": 180,
                "runtime_verified": True,
                "is_essential": True,
            }
        ],
    },
    "emergency_contacts": [
        {"name": "김보호", "phone": "010-1111-2222", "relationship": "자녀", "priority": 1},
        {"name": "박보호", "phone": "010-5555-6666", "relationship": "이웃", "priority": 2},
    ],
    "change_reason": "정전 취약 환자 신규 등록",
}


def setup_function():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def guardian_token(client: TestClient) -> str:
    response = client.post("/api/v1/auth/guardians/signup", json=SIGNUP)
    return response.json()["data"]["token"]["accessToken"]


def test_patient_create_get_update_and_audit():
    with TestClient(app) as client:
        token = guardian_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        created = client.post("/api/v1/patients", json=PATIENT, headers=headers)
        assert created.status_code == 201, created.text
        patient = created.json()["data"]
        assert patient["regionCode"] == "11140"
        assert patient["powerProfile"]["devices"][0]["batteryRuntimeMinutes"] == 180
        assert [item["priority"] for item in patient["emergencyContacts"]] == [1, 2]

        fetched = client.get(f"/api/v1/patients/{patient['id']}", headers=headers)
        assert fetched.status_code == 200
        assert fetched.json()["data"]["addressDetail"] == "101동 101호"

        update = {**PATIENT, "version": patient["version"], "change_reason": "주소 및 안전 여유시간 갱신"}
        update["address_detail"] = "101동 202호"
        update["power_profile"] = {**PATIENT["power_profile"], "safety_margin_minutes": 45}
        updated = client.put(f"/api/v1/patients/{patient['id']}", json=update, headers=headers)
        assert updated.status_code == 200, updated.text
        assert updated.json()["data"]["version"] == patient["version"] + 1
        assert updated.json()["data"]["powerProfile"]["safetyMarginMinutes"] == 45

        stale = client.put(f"/api/v1/patients/{patient['id']}", json=update, headers=headers)
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "OPTIMISTIC_LOCK_CONFLICT"

    with SessionLocal() as db:
        assert len(db.scalars(select(AuditLog).where(AuditLog.entity_id == patient["id"])).all()) == 2
        assert len(db.scalars(select(MedicalDevice)).all()) == 1
        assert len(db.scalars(select(EmergencyContact).where(EmergencyContact.patient_id == patient["id"])).all()) == 2


def test_patient_cannot_create_or_update_and_contact_validation():
    with TestClient(app) as client:
        guardian_access = client.post("/api/v1/auth/guardians/signup", json=SIGNUP).json()["data"]
        patient_login = client.post(
            "/api/v1/auth/patients/login",
            json={"guardian_code": guardian_access["guardianCode"]},
        ).json()["data"]
        patient_headers = {"Authorization": f"Bearer {patient_login['token']['accessToken']}"}
        assert client.post("/api/v1/patients", json=PATIENT, headers=patient_headers).status_code == 403

        guardian_headers = {"Authorization": f"Bearer {guardian_access['token']['accessToken']}"}
        invalid = {**PATIENT, "emergency_contacts": [PATIENT["emergency_contacts"][0], {**PATIENT["emergency_contacts"][1], "priority": 1}]}
        response = client.post("/api/v1/patients", json=invalid, headers=guardian_headers)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
