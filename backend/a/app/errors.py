from dataclasses import dataclass, field


@dataclass
class AppError(Exception):
    status_code: int
    code: str
    message: str
    details: dict | list = field(default_factory=dict)


class ConflictError(AppError):
    def __init__(self, code: str, message: str):
        super().__init__(409, code, message)


class AuthenticationError(AppError):
    def __init__(self, code: str, message: str):
        super().__init__(401, code, message)


class ServiceUnavailableError(AppError):
    def __init__(self, code: str, message: str):
        super().__init__(503, code, message)


class NotFoundError(AppError):
    def __init__(self, code: str, message: str):
        super().__init__(404, code, message)


class ForbiddenError(AppError):
    def __init__(self, code: str, message: str):
        super().__init__(403, code, message)


class GoneError(AppError):
    def __init__(self, code: str, message: str):
        super().__init__(410, code, message)
