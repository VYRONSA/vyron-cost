import VyronCostShell from "./VyronCostShell";

export default function PlaceholderPage({
  title,
}: {
  title: string;
}) {
  return (
    <VyronCostShell
      title={title}
      subtitle={`${title} module is currently under development inside the VYRON COST platform.`}
    >
      <div className="rounded-[2rem] border border-white bg-white p-10 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="text-3xl font-black text-[#07110d]">
          {title}
        </div>

        <div className="mt-4 max-w-3xl text-base leading-8 text-slate-500">
          This module will become part of the VYRON COST enterprise profit intelligence ecosystem.
        </div>
      </div>
    </VyronCostShell>
  );
}