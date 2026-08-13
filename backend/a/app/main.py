from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Base, engine
from .errors import AppError
from .api_responses import failure, success
from .auth.router import router as auth_router
from .outages.router import router as outages_router
from .patients.router import core_router as core_patients_router
from .patients.router import router as patients_router
from .responses.router import router as responses_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Spark Backend API", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    details = [{"field": ".".join(map(str, item["loc"][1:])), "message": item["msg"]} for item in exc.errors()]
    return failure("VALIDATION_ERROR", "요청값이 올바르지 않습니다.", details, 422)


@app.exception_handler(AppError)
async def app_error(_: Request, exc: AppError):
    return failure(exc.code, exc.message, exc.details, exc.status_code)


@app.get("/health")
def health():
    return success({"status": "UP"})


app.include_router(auth_router)
app.include_router(patients_router)
app.include_router(core_patients_router)
app.include_router(outages_router)
app.include_router(responses_router)
