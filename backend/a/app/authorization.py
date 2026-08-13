from collections.abc import Collection

from .errors import ForbiddenError
from .models import UserRole


Identity = tuple[str, UserRole]


def require_role(
    identity: Identity,
    required: UserRole,
    error_code: str = "ROLE_REQUIRED",
    message: str | None = None,
) -> str:
    actor_id, actual = identity
    if actual != required:
        raise ForbiddenError(error_code, message or f"{required.value} 역할이 필요합니다.")
    return actor_id


def require_any_role(identity: Identity, allowed: Collection[UserRole]) -> str:
    actor_id, actual = identity
    if actual not in allowed:
        names = ", ".join(role.value for role in allowed)
        raise ForbiddenError("ROLE_REQUIRED", f"다음 역할 중 하나가 필요합니다: {names}")
    return actor_id
