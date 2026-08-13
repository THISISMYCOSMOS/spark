from fastapi import Depends, Header
from sqlalchemy.orm import Session

from .database import get_db
from .errors import AuthenticationError
from .models import UserRole
from .security import decode_access_token
from .auth.service import AuthService


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db)


def current_identity(authorization: str | None = Header(default=None)) -> tuple[str, UserRole]:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationError("AUTHENTICATION_REQUIRED", "로그인이 필요합니다.")
    payload = decode_access_token(authorization[7:])
    return payload["sub"], UserRole(payload["role"])
