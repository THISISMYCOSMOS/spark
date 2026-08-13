import os

os.environ["DATABASE_URL"] = "sqlite:///./test_auth.db"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["GUARDIAN_CODE_PEPPER"] = "test-pepper"

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


SIGNUP = {
    "guardian_name": "김보호",
    "guardian_phone": "010-1234-5678",
    "password": "safe-password",
    "patient_name": "이환자",
    "patient_phone": "010-9876-5432",
    "secondary_phone": "02-123-4567",
    "affiliated_institution": "행복복지관",
    "patient_address": "서울시 중구",
    "diagnosis": "호흡기 질환",
    "electronic_devices": ["가정용 인공호흡기", "산소발생기"],
}


def setup_function():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def test_guardian_signup_login_and_patient_code_login():
    with TestClient(app) as client:
        signup = client.post("/api/v1/auth/guardians/signup", json=SIGNUP)
        assert signup.status_code == 201
        data = signup.json()["data"]
        assert data["role"] == "GUARDIAN"
        assert len(data["guardianCode"]) == 6
        assert data["guardianCode"].isdigit()

        duplicate = client.post("/api/v1/auth/guardians/signup", json=SIGNUP)
        assert duplicate.status_code == 409

        login = client.post("/api/v1/auth/guardians/login", json={"phone": "01012345678", "password": "safe-password"})
        assert login.status_code == 200
        assert login.json()["data"]["patients"][0]["name"] == "이환자"

        patient_login = client.post("/api/v1/auth/patients/login", json={"guardian_code": data["guardianCode"]})
        assert patient_login.status_code == 200
        patient_data = patient_login.json()["data"]
        assert patient_data["role"] == "PATIENT"

        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {patient_data['token']['accessToken']}"})
        assert me.status_code == 200
        assert me.json()["data"]["patient"]["name"] == "이환자"


def test_wrong_password_and_code_are_rejected():
    with TestClient(app) as client:
        client.post("/api/v1/auth/guardians/signup", json=SIGNUP)
        assert client.post("/api/v1/auth/guardians/login", json={"phone": "01012345678", "password": "wrong-pass"}).status_code == 401
        assert client.post("/api/v1/auth/patients/login", json={"guardian_code": "999999"}).status_code == 401


def test_frontend_cors_preflight_allows_auth_and_idempotency_headers():
    with TestClient(app) as client:
        response = client.options(
            "/api/v1/auth/guardians/login",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
