import FinanceImportsClient from "@/components/vyron-finance/FinanceImportsClient";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";

export default function FinanceImportsPage() {
  return (
    <VyronCostShell title="CSV Financial Imports" subtitle="TRIAL BALANCE · GL · AP · AR · INVENTORY · BANK">
      <FinanceNav />
      <FinanceImportsClient />
    </VyronCostShell>
  );
}
