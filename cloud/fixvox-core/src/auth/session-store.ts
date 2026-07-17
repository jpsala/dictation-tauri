import type { AuthSessionPort } from "../ports";

export type JsonAuthSessionStore = {
  getJson<T>(key: string): Promise<T | null>;
  getString(key: string): Promise<string | null>;
  putJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  putString(key: string, value: string, ttlSeconds: number): Promise<void>;
};

export function createJsonAuthSessionStore(port: AuthSessionPort): JsonAuthSessionStore {
  return {
    async getJson<T>(key: string): Promise<T | null> {
      const raw = await port.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    getString(key: string): Promise<string | null> {
      return port.get(key);
    },
    putJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      return port.put(key, JSON.stringify(value), ttlSeconds);
    },
    putString(key: string, value: string, ttlSeconds: number): Promise<void> {
      return port.put(key, value, ttlSeconds);
    },
  };
}
