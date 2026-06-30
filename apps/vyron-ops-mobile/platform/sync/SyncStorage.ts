import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { appConfig } from "@/utils/config";

const QUEUE_META_KEY = "vyron_sync_queue_meta";
const QUEUE_CHUNK_PREFIX = "vyron_sync_queue_chunk_";
const HISTORY_KEY = "vyron_sync_history";
const DEVICE_KEY = "vyron_sync_device";
const CHUNK_SIZE = 1800;

function webStorageKey(key: string) {
  return `vyron_ops_${key}`;
}

async function setSecureBlob(key: string, value: string) {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(webStorageKey(key), value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getSecureBlob(key: string) {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(webStorageKey(key));
  }
  return SecureStore.getItemAsync(key);
}

async function deleteSecureBlob(key: string) {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.removeItem(webStorageKey(key));
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function encodePayload(value: unknown) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))));
}

function decodePayload<T>(value: string): T {
  return JSON.parse(decodeURIComponent(escape(atob(value)))) as T;
}

export class SyncStorage {
  async saveQueue<T>(items: T[]) {
    const encoded = encodePayload(items);
    const chunks = Math.ceil(encoded.length / CHUNK_SIZE) || 1;
    await setSecureBlob(QUEUE_META_KEY, JSON.stringify({ chunks, version: appConfig.version }));
    for (let index = 0; index < chunks; index += 1) {
      const slice = encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      await setSecureBlob(`${QUEUE_CHUNK_PREFIX}${index}`, slice);
    }
    const existingMeta = await getSecureBlob(QUEUE_META_KEY);
    const parsed = existingMeta ? JSON.parse(existingMeta) : { chunks };
    for (let index = chunks; index < (parsed.chunks ?? chunks) + 5; index += 1) {
      await deleteSecureBlob(`${QUEUE_CHUNK_PREFIX}${index}`);
    }
  }

  async loadQueue<T>() {
    const metaRaw = await getSecureBlob(QUEUE_META_KEY);
    if (!metaRaw) return [] as T[];
    const meta = JSON.parse(metaRaw) as { chunks: number };
    let encoded = "";
    for (let index = 0; index < meta.chunks; index += 1) {
      const chunk = await getSecureBlob(`${QUEUE_CHUNK_PREFIX}${index}`);
      if (chunk) encoded += chunk;
    }
    if (!encoded) return [] as T[];
    return decodePayload<T[]>(encoded);
  }

  async saveHistory<T>(entries: T[]) {
    await setSecureBlob(HISTORY_KEY, encodePayload(entries));
  }

  async loadHistory<T>() {
    const raw = await getSecureBlob(HISTORY_KEY);
    if (!raw) return [] as T[];
    return decodePayload<T[]>(raw);
  }

  async saveDevice<T>(device: T) {
    await setSecureBlob(DEVICE_KEY, encodePayload(device));
  }

  async loadDevice<T>() {
    const raw = await getSecureBlob(DEVICE_KEY);
    if (!raw) return null;
    return decodePayload<T>(raw);
  }
}

export const syncStorage = new SyncStorage();
