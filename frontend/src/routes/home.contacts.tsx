import { createFileRoute, Link } from "@tanstack/react-router";
import { PhoneShell } from "@/components/PhoneShell";
import { TopBand } from "@/components/TopBand";
import { Pad } from "@/components/Pad";
import { BigButton } from "@/components/BigButton";
import { LineButton } from "@/components/LineButton";
import { contacts } from "@/data/mock";
import type { TextTone } from "@/data/mock";

export const Route = createFileRoute("/home/contacts")({
  head: () => ({
    meta: [
      { title: "도와줄 사람 · 정전 안심 케어" },
      { name: "description", content: "정전 시 연락할 보호자와 복지 담당자 목록입니다." },
      { property: "og:title", content: "도와줄 사람 · 정전 안심 케어" },
      { property: "og:description", content: "정전 시 연락할 보호자와 복지 담당자 목록입니다." },
    ],
  }),
  component: Page,
});

const roleToneText: Record<TextTone, string> = {
  safe: "text-safe",
  warn: "text-warn",
  crit: "text-crit",
  dim: "text-dim",
};

function Page() {
  const firstContact = contacts[0];

  return (
    <PhoneShell>
      <TopBand variant="safe" label="세 사람이 지켜보고 있습니다" />
      <Pad>
        <h1 className="t-metric-sm font-bold leading-tight text-ink">도와줄 사람</h1>
        <p className="t-body font-normal text-dim">전기가 끊기면 이 순서로 연락이 갑니다.</p>

        <div className="flex flex-col gap-4">
          {contacts.map((contact) => (
            <div key={contact.id} className="rounded-[20px] border-2 border-line bg-paper p-[22px]">
              <h2 className="t-subheading-sm font-bold text-ink">{contact.name}</h2>
              <p className="mt-1 t-body-sm font-normal text-dim">
                {contact.relation} · {contact.availability}
              </p>
              <p
                className={`mt-1 t-body-sm font-semibold ${
                  roleToneText[contact.roleTone ?? "safe"]
                }`}
              >
                {contact.role}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <BigButton
            as="a"
            href={`tel:${firstContact?.phone ?? ""}`}
            title={`${firstContact?.name ?? "보호자"} 님께 전화하기`}
            variant="safe"
            center
          />
          <Link to="/home">
            <LineButton>돌아가기</LineButton>
          </Link>
        </div>
      </Pad>
    </PhoneShell>
  );
}
