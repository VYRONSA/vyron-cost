import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";

const routes = [
  "/",
  "/dashboard",
  "/demo-flow",
  "/client-demo-script",
  "/pricing",
  "/platform-overview",
  "/suppliers",
  "/ingredients",
  "/recipes",
  "/recipes/new",
  "/products",
  "/purchase-orders",
  "/purchase-orders/new",
  "/document-intelligence",
  "/document-intelligence/new",
  "/recovery-opportunities",
  "/reports",
  "/bulk-import-centre",
  "/export-centre",
  "/training-manual",
  "/client-data-request",
  "/go-live-readiness",
];

export default function FinalTestingMapPage() {
  return (
    <VyronCostAiShell title="Final Testing Map" subtitle="Click through every page before the client sees the software.">
      <section className="grid gap-3">
        {routes.map((route, index) => (
          <Link key={route} href={route} className="rounded-2xl bg-white p-5 text-sm font-black text-slate-800 shadow-[0_12px_35px_rgba(81,63,190,0.06)] transition hover:bg-violet-50">
            {index + 1}. {route}
          </Link>
        ))}
      </section>
    </VyronCostAiShell>
  );
}
