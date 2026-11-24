import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { AppOperationMode } from "../types/portal";

const SESSION_KEY = "kredimax_clientes_session_v1";

export interface StoredPortalSession {
  mode: AppOperationMode;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  maskedCedula: string;
  customerName: string;
  mustChangePassword: boolean;
}

const memoryFallback = new Map<string, string>();

async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    memoryFallback.set(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    memoryFallback.set(key, value);
  }
}

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return memoryFallback.get(key) ?? null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

async function deleteSecureItem(key: string): Promise<void> {
  memoryFallback.delete(key);
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore secure store deletion errors on unsupported runtimes
  }
}

export async function savePortalSession(session: StoredPortalSession): Promise<void> {
  // Never store raw full cédula in persistent session storage
  const sanitized: StoredPortalSession = {
    ...session,
    maskedCedula: session.maskedCedula.startsWith("***-****")
      ? session.maskedCedula
      : "***-*******-*",
  };
  await setSecureItem(SESSION_KEY, JSON.stringify(sanitized));
}

export async function loadPortalSession(): Promise<StoredPortalSession | null> {
  const raw = await getSecureItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPortalSession;
    if (!parsed || (parsed.mode !== "DEMO" && parsed.mode !== "CONNECTED")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPortalSession(): Promise<void> {
  await deleteSecureItem(SESSION_KEY);
}
