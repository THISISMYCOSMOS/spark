# Lovable + Render 무료 데모 배포 체크리스트

## 배포 구성

- Lovable: `frontend/` 웹 애플리케이션 게시
- Backend A: Render 무료 FastAPI 웹 서비스
- Core: Render 무료 Node 웹 서비스
- DB: Render 무료 PostgreSQL
- Backend B: Core 프로세스 안에서 라이브러리로 실행

루트의 `render.yaml`을 Render Blueprint로 가져오면 위 리소스 세 개가 모두
무료 플랜으로 생성된다. 무료 웹 서비스는 유휴 상태에서 잠들고, 무료 DB는
생성 후 30일까지만 사용할 수 있으므로 이 구성은 시연용이다.

브라우저에서 `127.0.0.1` 또는 HTTP API를 호출하면 Lovable의 HTTPS 배포 환경에서 동작하지 않는다.

## Lovable 공개 환경변수

```dotenv
VITE_API_MODE=real
VITE_API_BASE_URL=https://spark-kw-b96b327a-api.onrender.com
VITE_CORE_API_BASE_URL=https://spark-kw-b96b327a-core.onrender.com
```

`VITE_*` 값은 브라우저 번들에 공개된다. API 키, Core 토큰, SOLAPI 비밀값을 넣지 않는다.

## Backend A 비밀·환경변수

```dotenv
DATABASE_URL=<Render Blueprint가 DB에서 자동 연결>
JWT_SECRET=<long-random-secret>
GUARDIAN_CODE_PEPPER=<long-random-secret>
RESPONSE_TOKEN_PEPPER=<long-random-secret>
CORE_ENGINE_TOKEN=<long-random-core-token>
CORS_ORIGINS=https://spark-kw.lovable.app
```

무료 플랜은 pre-deploy command를 지원하지 않으므로 Backend A의 시작 명령이
`alembic upgrade head`를 실행한 뒤 서버를 시작한다. SQLite 파일은 배포 DB로
사용하지 않는다.

## Core 비밀·환경변수

```dotenv
BACKEND_A_BASE_URL=https://spark-kw-b96b327a-api.onrender.com
BACKEND_A_CORE_TOKEN=<Backend A에서 자동 참조>
PUBLIC_RESPONSE_BASE_URL=https://spark-kw.lovable.app
GEMINI_API_KEY=<secret>
GEMINI_MODEL=gemini-3.5-flash
CORE_HOST=0.0.0.0
CORE_CORS_ORIGINS=https://spark-kw.lovable.app
```

`GEMINI_API_KEY`는 Blueprint 최초 생성 화면에서만 직접 입력하고 저장소에는
커밋하지 않는다. 문자 발송은 Mock 공급자로 유지하며 SOLAPI 환경값은 설정하지
않는다. Render 무료 웹 서비스에는 영속 디스크를 붙일 수 없으므로
`CORE_JOB_STORE_PATH`도 설정하지 않는다. Core의 메모리 작업은 서버가 잠들거나
재시작하면 사라지는 시연 환경 제한이 있다.

## 무료 플랜 제한

- 웹 서비스는 요청 없이 15분이 지나면 잠들며 첫 요청의 기동이 약 1분 걸릴 수 있다.
- 워크스페이스 전체 무료 인스턴스 시간은 월 750시간이다. 두 서비스가 계속
  깨어 있으면 이 한도를 함께 사용한다.
- 무료 PostgreSQL은 1GB이며 생성 30일 후 만료되고 백업을 제공하지 않는다.
- 결제수단을 등록하지 않으면 포함량 초과 시 과금 대신 서비스/빌드가 정지된다.
- 이 구성은 데모 전용이며 지속 운영이나 기존 기능의 영속성 보장용이 아니다.

## 게시 순서

1. Render에서 GitHub 저장소의 `render.yaml`을 Blueprint로 가져온다.
2. 최초 생성 화면에서 Core의 `GEMINI_API_KEY`만 입력하고 무료 플랜인지 재확인한다.
3. Backend A migration 및 두 서비스의 `/health`를 확인한다.
4. Lovable 환경변수에 두 HTTPS 주소를 설정한다.
5. Backend A와 Core CORS에 실제 Lovable 주소가 설정됐는지 확인한다.
6. Lovable에서 보안 검사를 실행하고 게시한다.
7. JPEG 판독, 문자 접수, 응답 링크, 복구 확인을 배포 환경에서 점검한다.

이 저장소는 Lovable과 연결되어 있으므로 이미 게시된 Git 기록을 force-push, rebase, amend 또는 squash하지 않는다.
