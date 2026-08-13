# 목업 재난 PDF 수신 계약

## 처리 흐름

1. 백엔드 1이 업로드 파일의 크기·권한을 확인하고 PDF 바이트를 백엔드 2에 전달한다.
2. `parseMockDisasterPdf()`가 PDF 텍스트와 필수 정형 필드를 검증한다.
3. `buildDisasterActivationCommand()`가 문서 SHA-256을 포함한 멱등 명령을 만든다.
4. `ingestMockDisasterPdf()`가 `DisasterActivationCommandPort.activateDisaster()`를 호출한다.
5. 백엔드 1은 트랜잭션 안에서 재난 상태를 `ACTIVE`로 저장하고 영향 환자 조회·워크플로 실행을 이어간다.

백엔드 2는 HTTP 업로드 라우트나 운영 DB를 소유하지 않는다.

## 허용 문서

- `DOCUMENT_TYPE`: `MOCK_DISASTER_ALERT_V1`
- `MODE`: `TEST`만 허용
- `STATUS`: `ACTIVE`만 허용
- `DISASTER_TYPE`: `TYPHOON`, `EARTHQUAKE`, `COLD_WAVE`, `FIRE`
- `REGION_CODE`: 실제 지역코드와 혼동하지 않도록 `99xxx`만 허용
- 최대 5 MiB, 1~3페이지

필수 필드가 누락되거나 중복되거나 형식이 잘못되면 `INVALID_MOCK_DISASTER_PDF`로 거부하며 전환 포트를 호출하지 않는다. 같은 문서는 `MOCK_PDF:{alertId}:{sha256}` 멱등키로 중복 처리를 차단한다.

## 목업 파일

`output/pdf/`의 4개 PDF는 `scripts/generate-mock-disaster-pdfs.py`로 재생성할 수 있다. 모두 `TEST ONLY · 실제 재난 아님` 표시와 가상 지역코드를 포함한다.
