import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { Pad } from "@/components/Pad";
import { CodeCells } from "@/components/CodeCells";
import { NumberPad } from "@/components/NumberPad";
import { useApp } from "@/contexts/AppContext";
import { DEVICE_OPTIONS, useGuardian } from "@/contexts/GuardianContext";
import { loginPatient } from "@/lib/api/auth";
import { ApiError, isRealApiMode } from "@/lib/api/client";

export const Route = createFileRoute("/join/code")({
  head: () => ({
    meta: [
      { title: "코드 입력 · 정전 안심 케어" },
      { name: "description", content: "코드 입력 화면 - 정전 취약가구 안심 케어 앱 프로토타입." },
      { property: "og:title", content: "코드 입력 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "코드 입력 화면 - 정전 취약가구 안심 케어 앱 프로토타입.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { code, setCode } = useApp();
  const { patientCode, setPatientCode, setField } = useGuardian();
  const navigate = useNavigate();
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loginStartedRef = useRef(false);

  useEffect(() => {
    if (code.length !== 6) return;
    if (!isRealApiMode()) {
      if (code === patientCode) {
        navigate({ to: "/join/confirm" });
      } else {
        setError("번호가 맞지 않습니다. 다시 눌러주세요.");
        setCode("");
      }
      return;
    }
    if (loginStartedRef.current) return;
    loginStartedRef.current = true;
    setIsSubmitting(true);
    setError("");

    void loginPatient(code)
      .then((result) => {
        const patient = result.patient;
        const guardian = result.guardian;
        setPatientCode(code);
        if (patient) {
          setField("patientName", patient.name);
          setField("patientPhone", patient.phone);
          setField("addressLine1", patient.address);
          setField(
            "selectedMachines",
            patient.electronicDevices
              .map((name) => DEVICE_OPTIONS.find((device) => device.name === name)?.id)
              .filter((id): id is string => Boolean(id)),
          );
        }
        if (guardian) {
          setField("guardianName", guardian.name);
          setField("guardianPhones", [{ id: "phone-1", kind: "휴대폰", number: guardian.phone }]);
        }
        navigate({ to: "/join/confirm" });
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof ApiError || cause instanceof Error
            ? cause.message
            : "번호를 확인하지 못했습니다. 다시 시도해 주세요.",
        );
        setCode("");
        loginStartedRef.current = false;
      })
      .finally(() => setIsSubmitting(false));
  }, [code, patientCode, navigate, setCode, setField, setPatientCode]);

  const handleDigit = (digit: string) => {
    if (code.length < 6) {
      setError("");
      setCode(code + digit);
    }
  };

  const handleDelete = () => {
    setError("");
    setCode(code.slice(0, -1));
  };

  // 키보드 숫자키 / 백스페이스 입력 지원
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setError("");
        setCode((prev) => (prev.length < 6 ? prev + e.key : prev));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setError("");
        setCode((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCode]);

  return (
    <PhoneShell>
      <Pad>
        <button
          type="button"
          onClick={() => router.history.back()}
          aria-label="뒤로 가기"
          className="-ml-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
        >
          <ChevronLeft size={24} strokeWidth={2.5} />
        </button>

        <h1 className="t-heading-lg font-bold leading-tight text-ink">
          보호자에게 받은
          <br />
          번호를 누르세요
        </h1>

        <CodeCells value={code} />

        <p className="t-body-sm text-dim">
          숫자 6자리를 모두 누르면 자동으로 다음 화면으로 넘어갑니다.
          <br />
          키보드 숫자키와 백스페이스(지움)도 쓸 수 있습니다.
          <br />
          {!isRealApiMode() ? (
            <span className="font-semibold text-ink">시연용 코드: {patientCode}</span>
          ) : null}
        </p>

        {isSubmitting ? (
          <p role="status" className="t-body font-semibold text-safe">
            번호를 확인하고 있습니다.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="t-body font-semibold text-crit">
            {error}
          </p>
        ) : null}

        <NumberPad onKey={handleDigit} onDelete={handleDelete} className="mt-auto" />
      </Pad>
    </PhoneShell>
  );
}
