import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm font-semibold text-slate-500">
          Loading sign in…
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
