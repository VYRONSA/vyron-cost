import { Suspense } from "react";
import DeveloperLoginClient from "./DeveloperLoginClient";

export default function DeveloperLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm font-semibold text-slate-500">
          Loading developer sign in...
        </main>
      }
    >
      <DeveloperLoginClient />
    </Suspense>
  );
}
