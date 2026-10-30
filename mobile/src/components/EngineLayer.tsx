import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NativeModules, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { enhancePrompt } from '@/lib/prompts';

/**
 * Motor embebido: WebView invisible que ejecuta el generador REAL de Perchance
 * (perchance.org/ai-text-to-image-generator).
 *
 * El resultado aparece dentro de un iframe de otro origen, así que lo lee un
 * módulo nativo (Kotlin) que habla CDP con esta misma WebView. Sin servidores.
 */

const GENERATOR_URL = 'https://perchance.org/ai-text-to-image-generator';

type DevtoolsBridge = {
  generate: (prompt: string) => Promise<string | null>;
  improve: (prompt: string) => Promise<string | null>;
  enableDebugging?: () => void;
};

const Devtools: DevtoolsBridge | undefined = (NativeModules as any)?.EngineDevtools;

export type EngineRequest = {
  prompt: string;
  negativePrompt?: string;
  resolution?: string;
  seed?: number;
  guidanceScale?: number;
};

export type EngineResult =
  | { ok: true; url: string; dataUrl?: string; seed?: number }
  | { ok: false; error: string };

type EngineContextValue = {
  ready: boolean;
  busy: boolean;
  status: string;
  generate: (req: EngineRequest) => Promise<EngineResult>;
  improve: (prompt: string) => Promise<{ text: string; source: 'engine' | 'local' } | null>;
};

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const webRef = useRef<any>(null);
  const busyRef = useRef(false);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Motor en espera');

  useEffect(() => {
    try {
      Devtools?.enableDebugging?.();
    } catch {
      // sólo existe en el build nativo
    }
  }, []);

  const generate = useCallback(async (req: EngineRequest): Promise<EngineResult> => {
    if (Platform.OS === 'web' || !Devtools) {
      return { ok: false, error: 'engine-unavailable' };
    }
    if (busyRef.current) {
      return { ok: false, error: 'busy' };
    }
    busyRef.current = true;
    setBusy(true);
    setStatus('Preparando motor');

    try {
      // La página del generador tiene que estar cargada antes de conducirla.
      for (let i = 0; i < 30 && !readyRef.current; i += 1) {
        await new Promise((r) => setTimeout(r, 500));
      }

      setStatus('Generando');
      const out = await Devtools.generate(req.prompt);

      if (!out) return { ok: false, error: 'timeout' };
      if (out.startsWith('data:image') || out.startsWith('http')) {
        setStatus('Listo');
        return { ok: true, url: out, dataUrl: out.startsWith('data:') ? out : undefined };
      }
      return { ok: false, error: 'unexpected' };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /**
   * Mejora el prompt: primero con el botón 🧠 del generador (vía CDP) y, si no
   * responde en ~25 s, con el enriquecedor local para que nunca quede muerto.
   */
  const improve = useCallback(
    async (prompt: string): Promise<{ text: string; source: 'engine' | 'local' } | null> => {
      if (Platform.OS === 'web') return null;
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setStatus('Mejorando idea');
      try {
        if (Devtools) {
          for (let i = 0; i < 20 && !readyRef.current; i += 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
          const out = await Devtools.improve(prompt);
          if (out && out.trim().length > 3 && out.trim() !== prompt.trim()) {
            return { text: out.trim(), source: 'engine' };
          }
        }
        const local = enhancePrompt(prompt);
        return local && local !== prompt ? { text: local, source: 'local' } : null;
      } catch {
        const local = enhancePrompt(prompt);
        return local !== prompt ? { text: local, source: 'local' } : null;
      } finally {
        busyRef.current = false;
        setBusy(false);
        setStatus('Motor listo');
      }
    },
    [],
  );

  const value = useMemo<EngineContextValue>(
    () => ({ ready, busy, status, generate, improve }),
    [ready, busy, status, generate, improve],
  );

  return (
    <EngineContext.Provider value={value}>
      {children}
      {Platform.OS !== 'web' && (
        <View pointerEvents="none" style={styles.hidden}>
          <WebView
            ref={webRef}
            source={{ uri: GENERATOR_URL }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptCanOpenWindowsAutomatically
            mediaPlaybackRequiresUserAction={false}
            onLoadEnd={() => {
              readyRef.current = true;
              setReady(true);
            }}
            onError={() => {
              readyRef.current = false;
              setReady(false);
            }}
            style={{ width: 360, height: 640, opacity: 0.01 }}
          />
        </View>
      )}
    </EngineContext.Provider>
  );
}

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used inside <EngineProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, left: -3000, top: 0, opacity: 0.01 },
});
