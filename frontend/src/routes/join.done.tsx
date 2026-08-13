import { createFileRoute, Link } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { BigButton } from "@/components/BigButton";

export const Route = createFileRoute("/join/done")({
  head: () => ({
    meta: [
      { title: "가입 완료 · 정전 안심 케어" },
      { name: "description", content: "가입 완료 화면 - 정전 취약가구 안심 케어 앱 프로토타입." },
      { property: "og:title", content: "가입 완료 · 정전 안심 케어" },
      {
        property: "og:description",
        content: "가입 완료 화면 - 정전 취약가구 안심 케어 앱 프로토타입.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PhoneShell>
      <TopBand variant="safe" label="준비가 끝났습니다" />
      <Pad>
        <h1 className="t-metric font-bold leading-tight text-ink">
          이제
          <br />
          지켜보고
          <br />
          있겠습니다
        </h1>

        <div className="rounded-[18px] bg-safe-bg p-5">
          <p className="t-body-sm font-medium text-safe">전기가 끊기면</p>
          <p className="mt-2 t-title-sm font-bold leading-snug text-safe">
            이 화면이 저절로 바뀝니다.
            <br />
            버튼 하나만 누르시면
            <br />
            보호자님께 연락이 갑니다.
          </p>
        </div>

        <p className="t-body font-normal leading-snug text-dim">
          아무것도 안 하셔도 됩니다.
          <br />못 누르시면 저희가 대신 연락합니다.
        </p>

        <div className="mt-auto">
          <Link to="/home">
            <BigButton title="시작하기" variant="safe" center />
          </Link>
        </div>
      </Pad>
    </PhoneShell>
  );
}
