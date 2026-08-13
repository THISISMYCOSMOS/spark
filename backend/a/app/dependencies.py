import secrets

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from .database import get_db
from .config import get_settings
from .errors import AuthenticationError
from .models import UserRole
from .security import decode_access_token
from .auth.service import AuthService


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db)


def current_identity(authorization: str | None = Header(default=None)) -> tuple[str, UserRole]:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationError("AUTHENTICATION_REQUIRED", "로그인이 필요합니다.")
    token = authorization[7:]
    configured_core_token = get_settings().core_engine_token
    if configured_core_token and secrets.compare_digest(token, configured_core_token):
        return "core-engine", UserRole.CORE_ENGINE
    payload = decode_access_token(token)
    return payload["sub"], UserRole(payload["role"])
