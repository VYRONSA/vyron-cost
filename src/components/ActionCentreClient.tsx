import { ArrowUpRight, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { ActionGroups } from "@/lib/vyron-demo-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function ActionGroup({
  title,
  tone,
  icon: Icon,
  items,
}: {
  title: string;
  tone: "red" | "amber" | "emerald";
  icon: typeof ShieldAlert;
  items: ActionGroups["urgent"];
}) {
  const header =
    tone === "red"
      ? "bg-red-50 text-red-800"
      : tone === "amber"
        ? "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]"
        : "bg-[#2C5A6B]/10 text-[#2F7C40]";

  return (
    <section className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(11,32,43,0.06)]">
      <div className={`mb-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${header}`}>
        <Icon size={16} />
        {title}
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 transition hover:border-[#2C5A6B]/25"
          >
            <div>
              <div className="font-black text-[#F8FAFC]">{item.title}</div>
              <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
            </div>
            <ArrowUpRight size={18} className="shrink-0 text-[#163A48]" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function ActionCentreClient({ groups }: { groups: ActionGroups }) {
  return (
    <VyronPremiumPageShell
      config={{
        title: "Action Centre",
        subtitle: "Premium VOLORA workflow for action centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
            <ActionGroup title="Urgent" tone="red" icon={ShieldAlert} items={groups.urgent} />
            <ActionGroup title="Review" tone="amber" icon={Clock} items={groups.review} />
            <ActionGroup title="Healthy" tone="emerald" icon={CheckCircle2} items={groups.healthy} />
          </div>
    </VyronPremiumPageShell>
  );
}
