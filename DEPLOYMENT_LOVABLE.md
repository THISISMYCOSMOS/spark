# Lovable 배포 체크리스트

## 배포 구성

- Lovable: `frontend/` 웹 애플리케이션 게시
- Backend A: FastAPI 애플리케이션을 별도 HTTPS 서비스와 영속 DB에 배포
- Core: Node 서버를 별도 HTTPS 서비스와 영속 볼륨에 배포
- Backend B: Core 프로세스 안에서 라이브러리로 실행

브라우저에서 `127.0.0.1` 또는 HTTP API를 호출하면 Lovable의 HTTPS 배포 환경에서 동작하지 않는다.

## Lovable 공개 환경변수

```dotenv
VITE_API_MODE=real
VITE_API_BASE_URL=https://api.example.com
VITE_CORE_API_BASE_URL=https://core.example.com
```

`VITE_*` 값은 브라우저 번들에 공개된다. API 키, Core 토큰, SOLAPI 비밀값을 넣지 않는다.

## Backend A 비밀·환경변수

```dotenv
DATABASE_URL=postgresql+psycopg://...
JWT_SECRET=<long-random-secret>
GUARDIAN_CODE_PEPPER=<long-random-secret>
RESPONSE_TOKEN_PEPPER=<long-random-secret>
CORE_ENGINE_TOKEN=<long-random-core-token>
CORS_ORIGINS=https://your-project.lovable.app
```

배포 전에 `alembic upgrade head`를 실행한다. SQLite 파일은 다중 인스턴스 운영 DB로 사용하지 않는다.

## Core 비밀·환경변수

```dotenv
BACKEND_A_BASE_URL=https://api.example.com
BACKEND_A_CORE_TOKEN=<same-long-random-core-token>
PUBLIC_RESPONSE_BASE_URL=https://your-project.lovable.app
GEMINI_API_KEY=<secret>
GEMINI_MODEL=<approved-model>
CORE_HOST=0.0.0.0
CORE_PORT=8100
CORE_CORS_ORIGINS=https://your-project.lovable.app
CORE_JOB_STORE_PATH=/data/core-jobs.json
```

`CORE_JOB_STORE_PATH`의 상위 디렉터리는 재시작 후에도 보존되는 볼륨이어야 한다. 문자 발송은 Mock 공급자로 유지하며 SOLAPI 환경값은 설정하지 않는다.

## 게시 순서

1. Backend A를 배포하고 migration 및 `/health`를 확인한다.
2. Core를 배포하고 Backend A 연결 및 `/health`를 확인한다.
3. Lovable 환경변수에 두 HTTPS 주소를 설정한다.
4. Backend A와 Core CORS에 실제 Lovable 주소를 설정한다.
5. Lovable에서 보안 검사를 실행하고 게시한다.
6. JPEG 판독, 문자 접수, 응답 링크, 복구 확인을 배포 환경에서 점검한다.

이 저장소는 Lovable과 연결되어 있으므로 이미 게시된 Git 기록을 force-push, rebase, amend 또는 squash하지 않는다.
