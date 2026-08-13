# CHIC

재택 의료기기 사용 가구를 위한 정전·재난 대응 서비스 프로토타입입니다. 환자와 보호자의 상태 확인, 정전 영향 가구 관리, 재난 알림 분석, 대응 흐름을 하나의 저장소에서 개발합니다.

> 현재 프로젝트는 프로토타입입니다. 기본 프론트엔드 설정은 목 데이터를 사용하며, AI 대응안과 재난 이미지 인식 결과는 운영 승인이나 의료 판단을 대신하지 않습니다.

## 구성

| 경로 | 역할 | 기술 |
| --- | --- | --- |
| `frontend/` | 환자·보호자·관리자 웹 화면 | React, TypeScript, TanStack Router, Vite |
| `backend/a/` | 인증, 환자, 정전, 응답, 푸시 API와 데이터 저장 | FastAPI, SQLAlchemy, Alembic |
| `core/` | 재난 문서·이미지 처리, AI 문구·대응안, 전체 워크플로 연결 | Node.js, Gemini API |
| `backend/b/` | 위험도 계산, 상태 전이, 알림·작업 큐 엔진 | Node.js |

## 빠른 시작: 프론트엔드 목업

백엔드나 API 키 없이 화면 흐름을 확인할 수 있습니다.

필요 환경:

- Bun

```powershell
cd frontend
Copy-Item .env.example .env
bun install
bun run dev
```

터미널에 표시되는 로컬 주소로 접속합니다. `.env.example`의 기본값인 `VITE_API_MODE=mock`을 유지하면 목 데이터를 사용합니다.

## 전체 로컬 실행

전체 연동에는 Python, Node.js 20.16 이상, Bun, Gemini API 키가 필요합니다. 아래 명령은 저장소 루트에서 각각 별도 PowerShell 터미널로 실행합니다.

### 1. Backend A

```powershell
cd backend/a
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --port 8000
```

- 상태 확인: `http://127.0.0.1:8000/health`
- API 문서: `http://127.0.0.1:8000/docs`

### 2. Core

```powershell
cd core
npm ci
Copy-Item .env.example .env
npm run dev
```

`core/.env`에서 다음 값을 실제 개발 환경에 맞게 설정합니다.

- `BACKEND_A_CORE_TOKEN`: `backend/a/.env`의 `CORE_ENGINE_TOKEN`과 같은 값
- `GEMINI_API_KEY`: Gemini API 키
- `GEMINI_MODEL`: 사용할 승인 모델

상태 확인: `http://127.0.0.1:8100/health`

### 3. Frontend

```powershell
cd frontend
Copy-Item .env.example .env
```

`frontend/.env`에서 실제 API 연동 모드로 변경합니다.

```dotenv
VITE_API_MODE=real
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_CORE_API_BASE_URL=http://127.0.0.1:8100
```

이어서 실행합니다.

```powershell
bun install
bun run dev
```

## 테스트

```powershell
# Backend A
cd backend/a
.\.venv\Scripts\Activate.ps1
pytest -q

# Backend B
cd backend/b
npm ci
npm test

# Core
cd core
npm ci
npm test

# Frontend 정적 검사와 빌드
cd frontend
bun install
bun run lint
bun run build
```

## 환경 변수와 보안

- 각 서비스의 `.env.example`을 복사해 로컬 `.env`를 만듭니다.
- `.env`와 API 키, 토큰, 운영 비밀값은 커밋하지 않습니다.
- `VITE_*` 값은 브라우저 번들에 공개되므로 비밀값을 넣지 않습니다.
- 기본 SQLite 설정은 로컬 개발용입니다. 운영 환경에서는 영속 데이터베이스와 충분히 긴 무작위 비밀값을 사용합니다.
- 테스트 재난은 Mock 알림 공급자를 사용합니다. 실제 문자·푸시 발송 여부는 별도의 운영 설정과 검증이 필요합니다.

## 문서

- [프론트엔드 상세 안내](frontend/README.md)
- [Backend A 안내](backend/a/README.md)
- [Backend A 연동 계약](backend/a/docs/frontend-api-integration.md)
- [Backend B 계약](backend/b/docs/BACKEND_2_CONTRACT.md)
- [AI 대응방법 계약](core/docs/RESPONSE_PLAN_CONTRACT.md)
- [Lovable 배포 체크리스트](DEPLOYMENT_LOVABLE.md)

## 배포 주의사항

이 저장소는 Lovable과 연결되어 있습니다. 이미 게시된 Git 기록을 force-push, rebase, amend 또는 squash하지 마세요. 배포 전에는 [Lovable 배포 체크리스트](DEPLOYMENT_LOVABLE.md)를 확인하세요.
