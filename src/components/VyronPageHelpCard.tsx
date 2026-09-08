import { Lightbulb } from "lucide-react";

export default function VyronPageHelpCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-blue-100 bg-blue-50/70 p-5 shadow-[0_10px_30px_rgba(29,78,216,0.06)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700">
          <Lightbulb size={20} />
        </div>
        <div>
          <h3 className="text-base font-black text-blue-800">{title}</h3>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{children}</div>
        </div>
      </div>
    </div>
  );
}
