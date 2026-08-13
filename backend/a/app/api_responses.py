from datetime import datetime, timezone

from fastapi.responses import JSONResponse


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def success(data: dict, status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"data": data, "meta": {"timestamp": timestamp()}, "error": None},
    )


def failure(code: str, message: str, details: dict | list, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "data": None,
            "meta": {"timestamp": timestamp()},
            "error": {"code": code, "message": message, "details": details},
        },
    )

