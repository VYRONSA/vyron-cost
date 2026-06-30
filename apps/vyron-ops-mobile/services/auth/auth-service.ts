import { apiClient } from "@/services/api";
import type { AuthSession, OpsUserProfile } from "@/types";
import { clearSecureSession, readSecureSession, writeSecureSession } from "./secure-storage";

export type SignInInput = {
  email: string;
  password: string;
};

export async function signIn(_input: SignInInput): Promise<AuthSession> {
  // Sprint 1: architecture placeholder — platform auth endpoint will be wired in Sprint 2.
  const session: AuthSession = {
    accessToken: null,
    refreshToken: null,
    email: _input.email,
    userId: null,
    expiresAt: null,
  };
  await writeSecureSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  await clearSecureSession();
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  return readSecureSession();
}

export async function fetchCurrentUser(): Promise<OpsUserProfile | null> {
  try {
    const response = await apiClient.get<{ ok: boolean; user?: OpsUserProfile }>("/api/workspace/status");
    return response.user ?? null;
  } catch {
    return null;
  }
}
