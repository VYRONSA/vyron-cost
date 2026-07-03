import { redirect } from "next/navigation";
import DeveloperAccessGuard from "@/components/DeveloperAccessGuard";
import DeveloperShell from "@/components/vyron-cost/developer/DeveloperShell";
import { requirePlatformSessionServer } from "@/lib/vyron-platform-auth";

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePlatformSessionServer();
  } catch {
    redirect("/developer-login?error=Developer%20authentication%20required");
  }

  return (
    <DeveloperAccessGuard>
      <DeveloperShell>{children}</DeveloperShell>
    </DeveloperAccessGuard>
  );
}
