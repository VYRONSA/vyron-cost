import type { ReactNode } from "react";
import {
  BookOpen,
  Calculator,
  Folder,
  Info,
  PackageCheck,
  Percent,
  Ruler,
  Tag,
  Truck,
} from "lucide-react";

export type FieldGuideItem = {
  title: string;
  description: string;
  example?: string;
  icon?: "tag" | "folder" | "truck" | "calculator" | "ruler" | "percent" | "package" | "info";
};

const iconMap = {
  tag: Tag,
  folder: Folder,
  truck: Truck,
  calculator: Calculator,
  ruler: Ruler,
  percent: Percent,
  package: PackageCheck,
  info: Info,
};

export function VyronFieldGuide({
  title = "Field Guide",
  subtitle = "Quick help for each field.",
  items,
  footer,
}: {
  title?: string;
  subtitle?: string;
  items: FieldGuideItem[];
  footer?: ReactNode;
}) {
  return (
    <aside className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
          <BookOpen size={22} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {items.map((item) => {
          const Icon = iconMap[item.icon || "info"];
          return (
            <div key={item.title} className="grid grid-cols-[28px_1fr] gap-3">
              <Icon size={20} className="mt-1 text-violet-700" />
              <div>
                <h3 className="text-sm font-black text-violet-700">{item.title}</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{item.description}</p>
                {item.example ? (
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                    <span className="font-black text-slate-600">Example:</span> {item.example}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {footer ? <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">{footer}</div> : null}
    </aside>
  );
}

export function FieldHint({ children, example }: { children: ReactNode; example?: string }) {
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-semibold leading-5 text-slate-500">{children}</p>
      {example ? <p className="text-xs font-medium leading-5 text-slate-400">Example: {example}</p> : null}
    </div>
  );
}
