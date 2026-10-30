import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // el almacenamiento puede fallar por cuota; no rompemos la UI
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export const STORAGE_KEYS = {
  artworks: 'aether.artworks.v1',
  credits: 'aether.credits.v1',
  settings: 'aether.settings.v1',
  onboarding: 'aether.onboarding.v1',
} as const;
