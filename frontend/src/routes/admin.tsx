import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { DemoBar } from "@/components/DemoBar";
import { LineButton } from "@/components/LineButton";
import { useOutage } from "@/contexts/OutageContext";
import { findRegionHouseholds } from "@/data/mock";

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

  const [area, setArea] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [cause, setCause] = useState("");
  const [logs, setLogs] = useState<SentLog[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const households = findRegionHouseholds(area);
  const powerDependent = households?.powerDependent ?? 0;
  const canSend = area.trim().length > 0 && powerDependent > 0;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice("");
    setReading(true);
    try {
      const extracted = await extractPdfText(file);
      if (!extracted) {
        setNotice("이 PDF에서 글자를 찾지 못했습니다. 내용을 직접 붙여넣어 주세요.");
      } else {
        setText(extracted);
      }
    } catch {
      setNotice("이 PDF에서 글자를 찾지 못했습니다. 내용을 직접 붙여넣어 주세요.");
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

  const onSend = () => {
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

  const onEnd = () => {
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
            {reading ? "PDF를 읽는 중입니다" : "정전 공지 PDF를 올려 주세요"}
          </p>
          <p className="mt-1 t-copy-sm text-dim">여기로 끌어다 놓거나 눌러서 파일을 고르세요</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
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
            지역
            <input className={fieldClass} value={area} onChange={(e) => setArea(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 t-copy-sm font-medium text-dim">
            시작 시각
            <input
              className={fieldClass}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 t-copy-sm font-medium text-dim">
            복구 예정
            <input
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
          {households ? (
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
          onClick={onSend}
          disabled={!canSend}
          className="w-full rounded-[18px] bg-crit px-6 py-5 t-title-lg font-bold text-paper transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-crit/40 disabled:cursor-not-allowed disabled:opacity-45"
        >
          이 내용으로 정전 알림 보내기
        </button>
        {area.trim() && powerDependent === 0 ? (
          <p className="t-copy font-medium text-crit">
            이 지역에는 등록된 전력의존 가구가 없습니다
          </p>
        ) : null}

        <button
          type="button"
          onClick={onEnd}
          disabled={outage.mode !== "outage"}
          className="w-full rounded-[18px] bg-safe px-6 py-5 t-title-lg font-bold text-paper transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/40 disabled:cursor-not-allowed disabled:opacity-45"
        >
          복구 알림 보내기
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
