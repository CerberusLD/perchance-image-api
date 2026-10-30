import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { deleteArtworkFile, setCustomEngine } from '@/lib/api';
import { FREE_DAILY_CREDITS, REWARDED_AD_CREDITS, UNLIMITED } from '@/lib/config';
import { setHapticsEnabled } from '@/lib/haptics';
import { readJSON, STORAGE_KEYS, writeJSON } from '@/lib/storage';

export type Artwork = {
  id: string;
  uri: string;
  prompt: string;
  negativePrompt: string;
  style: string | null;
  ratio: string;
  width: number;
  height: number;
  seed: number | null;
  createdAt: number;
  favorite: boolean;
  durationMs: number;
};

export type Settings = {
  haptics: boolean;
  defaultStyle: string | null;
  defaultRatio: string;
  saveToGallery: boolean;
  /** Motor propio (opcional). Si está vacío se usa el endpoint de la build. */
  engineUrl: string | null;
};

type Credits = { date: string; used: number; bonus: number };

type Toast = { id: number; message: string; tone: 'info' | 'success' | 'error' };

type AppState = {
  hydrated: boolean;
  artworks: Artwork[];
  favorites: Artwork[];
  settings: Settings;
  creditsLeft: number;
  creditsTotal: number;
  toast: Toast | null;
  addArtwork: (art: Omit<Artwork, 'id' | 'createdAt' | 'favorite'>) => Artwork;
  toggleFavorite: (id: string) => void;
  removeArtwork: (id: string) => void;
  clearLibrary: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  consumeCredit: () => boolean;
  grantReward: () => void;
  showToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: () => void;
};

const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_SETTINGS: Settings = {
  haptics: true,
  defaultStyle: null,
  defaultRatio: '1:1',
  saveToGallery: false,
  engineUrl: null,
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [credits, setCredits] = useState<Credits>({ date: today(), used: 0, bonus: 0 });
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carga inicial
  useEffect(() => {
    (async () => {
      const [storedArt, storedSettings, storedCredits] = await Promise.all([
        readJSON<Artwork[]>(STORAGE_KEYS.artworks, []),
        readJSON<Settings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
        readJSON<Credits>(STORAGE_KEYS.credits, { date: today(), used: 0, bonus: 0 }),
      ]);
      setArtworks(storedArt.filter((a) => !!a?.uri));
      const merged = { ...DEFAULT_SETTINGS, ...storedSettings };
      setSettings(merged);
      setHapticsEnabled(merged.haptics);
      setCustomEngine(merged.engineUrl);
      setCredits(storedCredits.date === today() ? storedCredits : { date: today(), used: 0, bonus: 0 });
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeJSON(STORAGE_KEYS.artworks, artworks);
  }, [artworks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeJSON(STORAGE_KEYS.settings, settings);
    setHapticsEnabled(settings.haptics);
    setCustomEngine(settings.engineUrl);
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeJSON(STORAGE_KEYS.credits, credits);
  }, [credits, hydrated]);

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const addArtwork = useCallback<AppState['addArtwork']>((art) => {
    const artwork: Artwork = {
      ...art,
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      favorite: false,
    };
    setArtworks((prev) => [artwork, ...prev]);
    return artwork;
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setArtworks((prev) =>
      prev.map((a) => (a.id === id ? { ...a, favorite: !a.favorite } : a)),
    );
  }, []);

  const removeArtwork = useCallback((id: string) => {
    setArtworks((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) deleteArtworkFile(target.uri);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearLibrary = useCallback(() => {
    setArtworks((prev) => {
      prev.forEach((a) => deleteArtworkFile(a.uri));
      return [];
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const normalized = useMemo<Credits>(
    () => (credits.date === today() ? credits : { date: today(), used: 0, bonus: 0 }),
    [credits],
  );
  const creditsRef = useRef<Credits>(normalized);
  useEffect(() => {
    creditsRef.current = normalized;
  }, [normalized]);

  const creditsTotal = FREE_DAILY_CREDITS + normalized.bonus;
  const creditsLeft = Math.max(0, creditsTotal - normalized.used);

  const consumeCredit = useCallback(() => {
    if (UNLIMITED) return true;
    const base = creditsRef.current.date === today()
      ? creditsRef.current
      : { date: today(), used: 0, bonus: 0 };
    const total = FREE_DAILY_CREDITS + base.bonus;
    if (base.used >= total) return false;
    const next = { ...base, used: base.used + 1 };
    creditsRef.current = next;
    setCredits(next);
    return true;
  }, []);

  const grantReward = useCallback(() => {
    const base = creditsRef.current.date === today()
      ? creditsRef.current
      : { date: today(), used: 0, bonus: 0 };
    const next = { ...base, bonus: base.bonus + REWARDED_AD_CREDITS };
    creditsRef.current = next;
    setCredits(next);
  }, []);

  const favorites = useMemo(() => artworks.filter((a) => a.favorite), [artworks]);

  const value = useMemo<AppState>(
    () => ({
      hydrated,
      artworks,
      favorites,
      settings,
      creditsLeft,
      creditsTotal,
      toast,
      addArtwork,
      toggleFavorite,
      removeArtwork,
      clearLibrary,
      updateSettings,
      consumeCredit,
      grantReward,
      showToast,
      dismissToast,
    }),
    [
      hydrated,
      artworks,
      favorites,
      settings,
      creditsLeft,
      creditsTotal,
      toast,
      addArtwork,
      toggleFavorite,
      removeArtwork,
      clearLibrary,
      updateSettings,
      consumeCredit,
      grantReward,
      showToast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
