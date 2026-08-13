import base64
import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timedelta, timezone

from .config import get_settings
from .errors import AuthenticationError
from .models import UserRole


def normalize_phone(value: str) -> str:
    phone = re.sub(r"\D", "", value)
    if not 9 <= len(phone) <= 15:
        raise ValueError("전화번호 형식이 올바르지 않습니다.")
    return phone


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt, expected = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.urlsafe_b64decode(salt), int(rounds))
        return hmac.compare_digest(base64.urlsafe_b64encode(actual).decode(), expected)
    except (ValueError, TypeError):
        return False


def generate_guardian_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def digest_guardian_code(code: str) -> str:
    normalized = re.sub(r"[\s-]", "", code).upper()
    return hmac.new(get_settings().guardian_code_pepper.encode(), normalized.encode(), hashlib.sha256).hexdigest()


def digest_response_token(token: str) -> str:
    return hmac.new(get_settings().response_token_pepper.encode(), token.encode(), hashlib.sha256).hexdigest()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _decode_b64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(subject_id: str, role: UserRole) -> tuple[str, int]:
    settings = get_settings()
    expires_in = settings.access_token_expire_minutes * 60
    now = datetime.now(timezone.utc)
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": subject_id,
        "role": role.value,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
        "jti": secrets.token_hex(16),
    }
    unsigned = f"{_b64url(json.dumps(header, separators=(',', ':')).encode())}.{_b64url(json.dumps(payload, separators=(',', ':')).encode())}"
    signature = hmac.new(settings.jwt_secret.encode(), unsigned.encode(), hashlib.sha256).digest()
    return f"{unsigned}.{_b64url(signature)}", expires_in


def decode_access_token(token: str) -> dict:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        unsigned = f"{encoded_header}.{encoded_payload}"
        expected = hmac.new(get_settings().jwt_secret.encode(), unsigned.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _decode_b64url(encoded_signature)):
            raise ValueError
        payload = json.loads(_decode_b64url(encoded_payload))
        if payload["exp"] <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError
        UserRole(payload["role"])
        return payload
    except (ValueError, KeyError, json.JSONDecodeError):
        raise AuthenticationError("INVALID_ACCESS_TOKEN", "인증 토큰이 유효하지 않습니다.")
