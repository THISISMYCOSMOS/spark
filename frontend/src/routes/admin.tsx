import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { DemoBar } from "@/components/DemoBar";
import { LineButton } from "@/components/LineButton";
import { useOutage } from "@/contexts/OutageContext";
import { findRegionHouseholds } from "@/data/mock";
import { isRealApiMode } from "@/lib/api/client";
import {
  processDisasterImage,
  processDisasterPdf,
  recognizeDisasterImage,
  reportOutageRecovery,
  type DisasterImageProposal,
  type DisasterProcessResult,
} from "@/lib/api/core";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "정전 공지 판독 · 관리자 콘솔" },
      {
        name: "description",
        content: "정전 공지 PDF를 읽어 값을 확인하고 대상 가구에 알림을 보내는 관리자 화면.",
      },
      { property: "og:title", content: "정전 공지 판독 · 관리자 콘솔" },
      {
        property: "og:description",
        content: "정전 공지 PDF를 읽어 값을 확인하고 대상 가구에 알림을 보내는 관리자 화면.",
      },
    ],
  }),
  component: AdminPage,
});

const placeholderExample =
  "2026년 8월 14일 21시 42분부터 서울 구로구 구로동 일대에 정전이 발생하였습니다. 원인은 배전설비 고장이며 복구 예정 시각은 22시 40분입니다.";

interface SentLog {
  id: number;
  at: string;
  text: string;
}

/** PDF 전체 페이지에서 텍스트를 뽑습니다. 브라우저에서만 실행합니다. */
async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return pages.filter(Boolean).join("\n").trim();
}

function pad2(value: string) {
  return value.padStart(2, "0");
}

function AdminPage() {
  const { outage, sendOutage, endOutage } = useOutage();

  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageProposal, setImageProposal] = useState<DisasterImageProposal | null>(null);
  const [processResult, setProcessResult] = useState<DisasterProcessResult | null>(null);

  const [area, setArea] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [cause, setCause] = useState("");
  const [logs, setLogs] = useState<SentLog[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const households = findRegionHouseholds(area);
  const powerDependent = households?.powerDependent ?? 0;
  const realMode = isRealApiMode();
  const selectedImage = selectedFile?.type.startsWith("image/") ?? false;
  const canSend = realMode
    ? selectedFile !== null && !reading && !sending && (!selectedImage || imageProposal !== null)
    : area.trim().length > 0 && powerDependent > 0;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice("");
    setProcessResult(null);
    setSelectedFile(file);
    setImageProposal(null);
    setReading(true);
    try {
      if (file.type === "application/pdf") {
        const extracted = await extractPdfText(file);
        if (!extracted) {
          setNotice("이 PDF에서 글자를 찾지 못했습니다. 내용을 직접 붙여넣어 주세요.");
        } else {
          setText(extracted);
        }
      } else if (file.type === "image/jpeg" || file.type === "image/png") {
        if (!realMode) throw new Error("이미지 판독은 실제 API 모드에서 사용할 수 있습니다.");
        const proposal = await recognizeDisasterImage(file);
        setImageProposal(proposal);
        setText(proposal.recognizedText);
        setCause(
          ({ TYPHOON: "태풍", EARTHQUAKE: "지진", COLD_WAVE: "한파", FIRE: "화재" } as const)[
            proposal.disasterType
          ],
        );
        setNotice("이미지 판독 결과입니다. 지역코드와 대응 시간을 확인한 뒤 보내 주세요.");
      } else {
        throw new Error("PDF, JPEG 또는 PNG 파일만 올릴 수 있습니다.");
      }
    } catch (cause) {
      setSelectedFile(null);
      setImageProposal(null);
      setNotice(cause instanceof Error ? cause.message : "파일을 판독하지 못했습니다.");
    } finally {
      setReading(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const parse = () => {
    const source = text;

    const areaMatch = source.match(/([가-힣]{2,10}[시군구])\s*([가-힣]{2,10}[동읍면리])?/);
    if (areaMatch) {
      setArea([areaMatch[1], areaMatch[2]].filter(Boolean).join(" "));
    }

    const times = [...source.matchAll(/(\d{1,2})\s*시\s*(\d{1,2})?\s*분?/g)];
    if (times[0]) setStartAt(`${pad2(times[0][1]!)}시 ${pad2(times[0][2] ?? "0")}분`);
    if (times[1]) setEndAt(`${pad2(times[1][1]!)}시 ${pad2(times[1][2] ?? "0")}분`);

    const causeMatch = source.match(
      /(배전설비|변압기|전신주|누전|공사|낙뢰|태풍|폭설|화재)[가-힣\s]*/,
    );
    if (causeMatch) setCause(causeMatch[0].trim());

    setNotice("");
  };

  const nowLabel = () =>
    new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  const onSend = async () => {
    if (realMode) {
      if (!selectedFile || sending) return;
      if (
        selectedImage &&
        (!imageProposal || !/^\d{5}$/.test(area.trim()) || startAt === "" || endAt === "")
      ) {
        setNotice("이미지 재난문자의 지역코드와 시작·복구 예정 시각을 모두 확인해 주세요.");
        return;
      }
      setSending(true);
      setNotice("");
      try {
        const result = selectedImage
          ? await processDisasterImage({
              proposalId: imageProposal!.proposalId,
              regionCode: area.trim(),
              startedAt: new Date(startAt).toISOString(),
              expectedEndAt: new Date(endAt).toISOString(),
            })
          : await processDisasterPdf(selectedFile);
        setProcessResult(result);
        setLogs((prev) => [
          {
            id: Date.now(),
            at: nowLabel(),
            text: `${result.outage.title} · 문자 접수 ${result.acceptedNotifications}건 · 알람 ${result.alarmStarted ? "시작" : "미시작"}`,
          },
          ...prev,
        ]);
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "재난 알림을 처리하지 못했습니다.");
      } finally {
        setSending(false);
      }
      return;
    }
    sendOutage({ area, startAt, endAt, cause, sentAt: Date.now() });
    setLogs((prev) => [
      {
        id: Date.now(),
        at: nowLabel(),
        text: `정전 알림 · ${area} · ${startAt || "시각 미상"} 시작 · ${cause || "원인 미상"}`,
      },
      ...prev,
    ]);
  };

  const onEnd = async () => {
    if (realMode) {
      if (!processResult || recovering) return;
      setRecovering(true);
      setNotice("");
      try {
        const result = await reportOutageRecovery(processResult.outage.id);
        setProcessResult((current) =>
          current
            ? { ...current, outage: { ...current.outage, status: result.outageStatus } }
            : current,
        );
        setLogs((prev) => [
          {
            id: Date.now(),
            at: nowLabel(),
            text: `복구 알림 · 환자 확인 ${result.recoveryChecksStarted}건 · 전환 ${result.transitionedCases}건`,
          },
          ...prev,
        ]);
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "복구 알림을 처리하지 못했습니다.");
      } finally {
        setRecovering(false);
      }
      return;
    }
    endOutage();
    setLogs((prev) => [
      { id: Date.now(), at: nowLabel(), text: "복구 알림 · 전기가 다시 들어왔습니다" },
      ...prev,
    ]);
  };

  const fieldClass =
    "w-full rounded-[14px] border-2 border-line bg-paper px-4 py-3 t-body-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/30";

  return (
    <div className="min-h-screen bg-wash px-6 py-10">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <header>
          <h1 className="t-heading-2xl font-bold text-ink">정전 공지 판독</h1>
          <p className="mt-2 t-body-sm leading-[150%] text-dim">
            읽어낸 내용은 사람이 확인한 뒤 보냅니다. 잘못 읽었으면 직접 고치세요.
          </p>
        </header>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`cursor-pointer rounded-[14px] border-2 border-dashed p-[26px] text-center transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/30 ${
            dragging ? "border-safe bg-safe-bg" : "border-line bg-paper"
          }`}
        >
          <p className="t-body-lg font-semibold text-ink">
            {reading ? "재난문자를 읽는 중입니다" : "재난문자 PDF 또는 이미지를 올려 주세요"}
          </p>
          <p className="mt-1 t-copy-sm text-dim">여기로 끌어다 놓거나 눌러서 파일을 고르세요</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={onPick}
          />
        </div>

        {notice ? (
          <p className="rounded-[14px] bg-warn-bg px-4 py-3 t-copy font-medium text-warn">
            {notice}
          </p>
        ) : null}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={placeholderExample}
          className="w-full rounded-[14px] border-2 border-line bg-paper p-4 t-copy leading-[150%] text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/30"
        />

        <LineButton onClick={parse}>내용 읽기</LineButton>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 t-copy-sm font-medium text-dim">
            {realMode && selectedImage ? "지역코드(5자리)" : "지역"}
            <input
              className={fieldClass}
              value={area}
              inputMode={realMode && selectedImage ? "numeric" : undefined}
              maxLength={realMode && selectedImage ? 5 : undefined}
              placeholder={realMode && selectedImage ? "예: 11530" : undefined}
              onChange={(e) => setArea(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 t-copy-sm font-medium text-dim">
            시작 시각
            <input
              type={realMode && selectedImage ? "datetime-local" : "text"}
              className={fieldClass}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 t-copy-sm font-medium text-dim">
            복구 예정
            <input
              type={realMode && selectedImage ? "datetime-local" : "text"}
              className={fieldClass}
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 t-copy-sm font-medium text-dim">
            원인
            <input
              className={fieldClass}
              value={cause}
              onChange={(e) => setCause(e.target.value)}
            />
          </label>
        </div>

        <div className="rounded-[18px] border-2 border-line bg-paper p-[22px]">
          <h2 className="t-subheading-sm font-bold text-ink">대상 가구</h2>
          {realMode ? (
            processResult ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="t-copy-sm font-medium text-dim">조회 환자</p>
                    <p className="t-heading-lg font-bold text-ink">
                      {processResult.matchedPatients}
                    </p>
                  </div>
                  <div>
                    <p className="t-copy-sm font-medium text-dim">문자 접수</p>
                    <p className="t-heading-lg font-bold text-crit">
                      {processResult.acceptedNotifications}
                    </p>
                  </div>
                  <div>
                    <p className="t-copy-sm font-medium text-dim">알람</p>
                    <p className="t-heading-lg font-bold text-ink">
                      {processResult.alarmStarted ? "시작" : "대기"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 t-body-sm leading-[150%] text-dim">
                  지역코드 {processResult.outage.regionCode} · 대응 건 {processResult.createdCases}
                  건
                </p>
              </>
            ) : (
              <p className="mt-2 t-body-sm leading-[150%] text-dim">
                PDF는 정형 필드, 이미지는 관리자 확인 지역코드로 대상 환자를 조회합니다.
              </p>
            )
          ) : households ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <p className="t-copy-sm font-medium text-dim">등록 가구</p>
                  <p className="t-heading-lg font-bold text-ink">{households.registered}</p>
                </div>
                <div>
                  <p className="t-copy-sm font-medium text-dim">전력의존 가구</p>
                  <p className="t-heading-lg font-bold text-crit">{households.powerDependent}</p>
                </div>
                <div>
                  <p className="t-copy-sm font-medium text-dim">보호자</p>
                  <p className="t-heading-lg font-bold text-ink">{households.guardians}</p>
                </div>
              </div>
              <p className="mt-3 t-body-sm leading-[150%] text-dim">
                담당 기관 · {households.agency}
              </p>
            </>
          ) : (
            <p className="mt-2 t-body-sm leading-[150%] text-dim">
              지역을 입력하면 대상 가구를 보여 드립니다.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void onSend()}
          disabled={!canSend}
          className="w-full rounded-[18px] bg-crit px-6 py-5 t-title-lg font-bold text-paper transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-crit/40 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {sending ? "문자와 알람을 처리하고 있습니다" : "이 내용으로 재난 알림 보내기"}
        </button>
        {!realMode && area.trim() && powerDependent === 0 ? (
          <p className="t-copy font-medium text-crit">
            이 지역에는 등록된 전력의존 가구가 없습니다
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void onEnd()}
          disabled={
            realMode
              ? !processResult || processResult.outage.status !== "ACTIVE" || recovering
              : outage.mode !== "outage"
          }
          className="w-full rounded-[18px] bg-safe px-6 py-5 t-title-lg font-bold text-paper transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/40 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {recovering ? "복구 확인을 보내고 있습니다" : "복구 알림 보내기"}
        </button>

        <div className="rounded-[18px] border-2 border-line bg-paper p-[22px]">
          <h2 className="t-subheading-sm font-bold text-ink">보낸 기록</h2>
          {logs.length === 0 ? (
            <p className="mt-2 t-body-sm leading-[150%] text-dim">아직 보낸 알림이 없습니다</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {logs.map((log) => (
                <li key={log.id} className="flex gap-3 t-copy leading-[150%]">
                  <span className="shrink-0 font-semibold text-dim">{log.at}</span>
                  <span className="text-ink">{log.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DemoBar />
      </div>
    </div>
  );
}
