import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

export function VyronQuoteCard({ quote, attribution }: { quote: string; attribution: string }) {
  return (
    <div className={`relative overflow-hidden p-6 md:p-7 ${M.lightCard}`}>
      <div className="pointer-events-none absolute -right-6 -top-6 text-[96px] font-black leading-none text-[#1D6BFF]/10">
        &ldquo;
      </div>
      <p className={`relative max-w-3xl text-lg font-bold leading-snug md:text-xl ${M.heading}`}>&ldquo;{quote}&rdquo;</p>
      <p className={`relative mt-3 text-[11px] font-bold uppercase tracking-[0.14em] ${M.muted}`}>— {attribution}</p>
    </div>
  );
}
