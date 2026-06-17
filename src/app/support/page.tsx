import VyronCostAiShell from "@/components/VyronCostAiShell";
import { VYRON_SURFACE } from "@/components/vyron-ui";

const supportCards = [
  ["WhatsApp Support", "Use WhatsApp for urgent demo/pilot issues."],
  ["Email Support", "Use email for data files and structured requests."],
  ["Weekly Check-in", "During pilot, schedule weekly feedback call."],
  ["Bug Reporting", "Screenshot the issue and describe the page/action."],
  ["Data Help", "Assist with cleaning and importing templates."],
  ["Training", "Provide user training after first data load."],
] as const;

export default function Page() {
  return (
    <VyronCostAiShell hidePageHeader title="Support" subtitle="Simple support structure for demo and pilot clients.">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {supportCards.map(([title, text]) => (
          <div key={title} className={`${VYRON_SURFACE.dark} p-6`}>
            <h2 className="text-2xl font-black text-[#F8FAFC]">{title}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-[#CBD5E1]">{text}</p>
          </div>
        ))}
      </section>
    </VyronCostAiShell>
  );
}
