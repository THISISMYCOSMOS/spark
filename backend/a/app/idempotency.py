import hashlib
import json
from collections.abc import Callable

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .errors import ConflictError
from .models import IdempotencyRecord


def execute_idempotent(
    db: Session,
    actor_id: str,
    scope: str,
    key: str,
    request: BaseModel,
    operation: Callable[[], dict],
) -> dict:
    normalized = json.dumps(request.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    request_hash = hashlib.sha256(normalized.encode()).hexdigest()
    existing = db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.actor_id == actor_id,
            IdempotencyRecord.scope == scope,
            IdempotencyRecord.idempotency_key == key,
        )
    )
    if existing:
        if existing.request_hash != request_hash:
            raise ConflictError("IDEMPOTENCY_KEY_REUSED", "같은 Idempotency-Key를 다른 요청에 사용할 수 없습니다.")
        return existing.response_data

    result = operation()
    db.add(IdempotencyRecord(actor_id=actor_id, scope=scope, idempotency_key=key, request_hash=request_hash, response_data=result))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        concurrent = db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.actor_id == actor_id, IdempotencyRecord.scope == scope, IdempotencyRecord.idempotency_key == key))
        if concurrent and concurrent.request_hash == request_hash:
            return concurrent.response_data
        raise ConflictError("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key 처리 중 충돌했습니다.") from exc
    return result
