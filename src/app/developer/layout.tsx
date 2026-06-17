import DeveloperAccessGuard from "@/components/DeveloperAccessGuard";
import DeveloperShell from "@/components/vyron-cost/developer/DeveloperShell";

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return (
    <DeveloperAccessGuard>
      <DeveloperShell>{children}</DeveloperShell>
    </DeveloperAccessGuard>
  );
}
