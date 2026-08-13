# 정전 안심 케어 (프로토타입)

정전 취약가구(재택 의료기기 사용자)를 위한 모바일 우선 앱 프로토타입입니다.
백엔드 없이 동작하며, 모든 데이터는 `src/data/mock.ts`의 목 데이터입니다.

## 기술 구성

- React + TypeScript + Tailwind CSS (TanStack Router)
- 상태는 React 로컬 상태와 Context만 사용
  - `AppContext` — 환자 화면(가입 코드, 경보 응답)
  - `GuardianContext` — 보호자 등록 정보, 병명·기계, 자립시간 계산, 연락 순서, 6자리 코드
  - `OutageContext` — 정전 상태(mode / area / startAt / endAt / patientAnswer).
    localStorage + BroadcastChannel로 탭 간 공유
- 폰트: IBM Plex Sans KR (400 / 500 / 600 / 700)
- 색상 토큰은 `src/styles.css`에 CSS 변수로 정의 (paper, wash, line, ink, dim,
  crit, warn, safe 계열, lock-bg)

## 레이아웃 규칙

- `PhoneShell`(환자) / `GuardianShell`(보호자) — 데스크톱에서 **400 x 812 고정**
  폰 프레임, 430px 이하에서는 프레임 없이 전체 화면
- 상태바 · 네비게이션 · 진행 막대는 고정, 본문만 세로 스크롤합니다
- 본문 끝의 `GuardianSpacer`(보호자) / `flex-1` 여백(환자)이 하단 버튼을
  프레임 아래에 붙여 둡니다
- 뒤로가기는 `useBack(fallback)` — 어느 경로로 들어왔든 직전 화면으로 돌아가고,
  방문 기록이 없으면 지정한 기본 경로로 갑니다
- 글씨 크기는 화면에서 px를 직접 쓰지 않고 `src/styles.css`의 역할 클래스
  (`t-display`, `t-heading`, `t-title`, `t-body`, `t-caption` 등)를 씁니다
- `TopBand` — 상단 색 띠(crit / warn / safe / none), 왼쪽에 뒤로 가기 버튼과
  상태 표시 원, `live`일 때 원이 깜빡임
- `Pad` — 본문 영역(좌우 24px, 위 26px, 아래 24px, 세로 flex)
- 모든 버튼에 `focus-visible` 포커스 링, `prefers-reduced-motion: reduce`에서
  깜빡임과 전환이 멈춥니다

## 환자 화면 17개

### 가입 (join)

| 경로 | 역할 |
| --- | --- |
| `/join/role` | 첫 화면. 코드 입력 / 보호자 등록 중 선택 |
| `/join/code` | 보호자에게 받은 6자리 코드 입력 (6자리 입력 시 자동 이동) |
| `/join/confirm` | 등록된 이름·주소·기계·연락처 확인 |
| `/join/done` | 준비 완료 안내 |

### 평상시 (home)

| 경로 | 역할 |
| --- | --- |
| `/home` | 안전 상태, 버틸 수 있는 시간, 점검 안내. 상단에 시연용 "정전 발생" 버튼 |
| `/home/devices` | 산소발생기·예비 배터리·전동침대 상태 |
| `/home/contacts` | 연락 순서대로 정리된 도와줄 사람 3명 |

### 정전 발생 (alert / after)

| 경로 | 역할 |
| --- | --- |
| `/alert` | 가장 중요한 화면. 자립시간 감소, 180초 무응답 타이머, 3개 응답 버튼 |
| `/alert/sent` | 보호자 문자 발송 팝업(한 번만 노출). 선택한 응답 색으로 표시 |
| `/after/ok` | "괜찮습니다" 응답 후 안내 |
| `/after/guardian` | 보호자 도착까지 남은 시간과 배터리 잔여 시간 비교 |
| `/after/call` | 119에 전달할 위치·상황·대상자 정보 |
| `/after/dial` | 시연용 전화 앱 화면 |
| `/after/done` | 정전 종료 요약. "처음으로"에서 Context 초기화 |

### 생체신호 (vitals)

| 경로 | 역할 |
| --- | --- |
| `/vitals/normal` | 평소와 같은 상태 (safe) |
| `/vitals/warn` | 하나가 평소와 다른 상태 (warn) |
| `/vitals/crit` | 보호자·119에 알린 상태 (crit) |

### 보호자 (guardian)

| 경로 | 역할 |
| --- | --- |
| `/guardian/join/profile` | 1단계. 보호자 본인 정보와 전화번호 |
| `/guardian/join/patient` | 2단계. 대상자 정보와 주소 |
| `/guardian/join/health` | 3단계. 병명·사용 기계 → 500Wh 기준 자립시간 자동 계산 |
| `/guardian/join/contacts` | 4단계. 연락 순서(본인 1순위 → 보호자 → 기관, 자동 번호) |
| `/guardian/join/confirm` | 5단계. 등록 내용 확인 |
| `/guardian/join/code` | 6자리 코드 발급. 환자가 `/join/code`에 입력하면 연동 |
| `/guardian/home` | 대상자 상태, 자립시간, 연락 순서 |
| `/guardian/checkin` `/guardian/reply` `/guardian/noreply` | 평상시 안부 묻기 흐름 |
| `/guardian/alert` | 정전 알림. 진입 즉시 3분 카운트다운 |
| `/guardian/response` `/guardian/noresponse` | 환자 응답 / 3분 무응답 |
| `/guardian/progress` `/guardian/closed` | 대응 진행 / 상황 종료 |

### 관리자

`/admin` — 정전 공지 PDF 판독, 지역별 가구 조회, 알림 발송, 시연 조절 도구.

`/`는 개발용 화면 목록 인덱스입니다.

## 정전 연동 (OutageContext)

- `mode`가 `outage`가 되면 환자는 `/alert`, 보호자는 `/guardian/alert`로 이동합니다
  (이미 그 화면이면 중복 이동하지 않습니다)
- `mode`가 `calm`으로 돌아오면 보호자는 `/guardian/closed`로 이동합니다
- 환자 응답은 `patientAnswer`(`none` / `ok` / `guardian` / `call`)로 공유되고,
  보호자는 각각 `/guardian/reply`, `/guardian/response`로 이동합니다
- 상단 띠와 복구 예정 문구는 Context의 `area` / `startAt` / `endAt`으로 만듭니다
- 화면이 바뀔 때 한 번 짧은 강조 효과를 주며,
  `prefers-reduced-motion: reduce`에서는 생략합니다

## 시연 순서

1. `/join/role` → 코드 입력 창 선택
2. `/join/code` → 아무 숫자 6자리 입력 (자동으로 다음 화면)
3. `/join/confirm` → "네, 맞습니다"
4. `/join/done` → "시작하기"
5. `/home` → 화면 아래 "3분을 8초로" 또는 "빠르게 보기"를 먼저 눌러 둡니다
6. `/home` 상단 "정전 발생" 버튼 → `/alert`
7. `/alert`에서 응답 선택 (또는 무응답으로 자동 진행)
   - 괜찮습니다 → `/after/ok`
   - 보호자 부르기 / 무응답 → `/after/guardian`
   - 119에 전화하기 → `/after/call` → `/after/dial`
8. `/after/done` → "처음으로"
9. 별도로 `/vitals/normal` → `/vitals/warn` → `/vitals/crit` 순서로 생체신호 시연

## 시연용 장치 (실제 서비스에는 없습니다)

- `/home` 상단 crit색 **정전 발생** 버튼: 즉시 `/alert`로 이동
- 폰 프레임 아래 조절 도구
  - **3분을 8초로** — 무응답 타이머를 8초로 단축
  - **빠르게 보기** — 모든 카운트다운 60배속 (다시 누르면 원래 속도)
  - **배터리가 먼저 떨어지는 경우** — 자립시간 600초, 도착시간 1500초

두 장치 모두 화면에 "시연용"임을 표기하고 있으며, `/after/done`의 "처음으로"
또는 Context `reset()`으로 초기화됩니다.
