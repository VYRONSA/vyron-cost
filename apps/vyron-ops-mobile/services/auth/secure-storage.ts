import * as SecureStore from "expo-secure-store";
import { appConfig } from "@/utils/config";
import type { AuthSession } from "@/types";

const SESSION_KEY = appConfig.secureStoreKeys.session;

export async function readSecureSession(): Promise<AuthSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export async function writeSecureSession(session: AuthSession | null): Promise<void> {
  if (!session) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSecureSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

/** Future: wire to expo-local-authentication when biometrics are enabled. */
export async function isBiometricAvailable(): Promise<boolean> {
  return false;
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  return false;
}
