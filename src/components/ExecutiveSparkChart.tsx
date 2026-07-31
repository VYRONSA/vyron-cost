"use client";

import type { TrendPoint } from "@/lib/vyron-executive-command-centre";

type Props = {
  data: TrendPoint[];
  height?: number;
  colour?: string;
  formatValue?: (n: number) => string;
  variant?: "bar" | "line";
};

export default function ExecutiveSparkChart({
  data,
  height = 120,
  colour = "#1d6bff",
  formatValue = (n) => String(Math.round(n)),
  variant = "bar",
}: Props) {
  const width = 100;
  const padding = 4;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = padding + (i / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return { x, y, v, label: data[i]?.label || "" };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
        {variant === "bar"
          ? points.map((p, i) => {
              const barW = (width - padding * 2) / values.length - 1;
              const barH = height - padding - p.y;
              return (
                <rect
                  key={i}
                  x={padding + i * (barW + 1)}
                  y={p.y}
                  width={Math.max(barW, 1)}
                  height={Math.max(barH, 0)}
                  fill={colour}
                  opacity={0.85}
                  rx={1}
                />
              );
            })
          : (
            <>
              <path d={linePath} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2} fill={colour} />
              ))}
            </>
          )}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-400">
        <span>{data[0]?.label}</span>
        <span>{formatValue(values[values.length - 1] ?? 0)}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
