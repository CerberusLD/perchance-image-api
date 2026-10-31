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
 * Motor embebido: WebView invisible que ejecuta el generador real
 * (perchance.org/ai-text-to-image-generator).
 *
 * El resultado aparece dentro de un iframe de otro origen, así que lo lee un
 * módulo nativo (Kotlin) que habla CDP con esta misma WebView. Sin servidores.
 *
 * Todas las operaciones (generar / mejorar / diagnosticar) pasan por una cola:
 * nunca hay dos sesiones CDP a la vez, que era lo que dejaba el botón bloqueado.
 */

const GENERATOR_URL = 'https://perchance.org/ai-text-to-image-generator';

type DevtoolsBridge = {
  generate: (prompt: string, style?: string | null) => Promise<string | null>;
  improve: (prompt: string) => Promise<string | null>;
  diagnose: () => Promise<string | null>;
  enableDebugging?: () => void;
};

const Devtools: DevtoolsBridge | undefined = (NativeModules as any)?.EngineDevtools;

export type EngineRequest = {
  prompt: string;
  /** Id del estilo; el motor lo selecciona en el propio generador. */
  style?: string | null;
  negativePrompt?: string;
  resolution?: string;
  seed?: number;
  guidanceScale?: number;
};

/** Códigos de fallo que devuelve el módulo nativo. */
export type EngineErrorCode =
  | 'no-socket'
  | 'no-page'
  | 'no-ui'
  | 'no-result'
  | 'stale'
  | 'busy'
  | 'engine-unavailable'
  | 'unexpected';

export type EngineResult =
  | { ok: true; url: string; dataUrl?: string; seed?: number }
  | { ok: false; error: EngineErrorCode; detail?: string };

type EngineContextValue = {
  ready: boolean;
  busy: boolean;
  status: string;
  generate: (req: EngineRequest) => Promise<EngineResult>;
  improve: (prompt: string) => Promise<{ text: string; source: 'engine' | 'local' } | null>;
  diagnose: () => Promise<string>;
};

const EngineContext = createContext<EngineContextValue | null>(null);

const KNOWN: EngineErrorCode[] = ['no-socket', 'no-page', 'no-ui', 'no-result', 'stale', 'busy'];

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const webRef = useRef<any>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Motor en espera');

  // Encender el inspector antes de que exista cualquier WebView (Android exige
  // que se active antes de crear la primera): sin esto no hay socket CDP.
  useEffect(() => {
    try {
      Devtools?.enableDebugging?.();
    } catch {
      // sólo existe en el build nativo
    }
  }, []);

  /** Encadena operaciones para que nunca se solapen. */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const waitReady = useCallback(async (budgetMs: number) => {
    const step = 500;
    for (let waited = 0; waited < budgetMs && !readyRef.current; waited += step) {
      await new Promise((r) => setTimeout(r, step));
    }
    return readyRef.current;
  }, []);

  const generate = useCallback(
    (req: EngineRequest): Promise<EngineResult> =>
      enqueue(async () => {
        if (Platform.OS === 'web' || !Devtools) {
          return { ok: false, error: 'engine-unavailable' as const };
        }
        setBusy(true);
        setStatus('Preparando motor');
        try {
          await waitReady(60000);
          setStatus('Generando');

          // Un solo reintento si el motor aún no estaba listo (arranque en frío).
          let out = await Devtools.generate(req.prompt, req.style ?? null);
          if (out && (out === 'ERR:no-socket' || out === 'ERR:no-page' || out === 'ERR:no-ui')) {
            setStatus('Reintentando');
            for (let i = 0; i < 8 && !readyRef.current; i += 1) {
              await new Promise((r) => setTimeout(r, 500));
            }
            await new Promise((r) => setTimeout(r, 2500));
            out = await Devtools.generate(req.prompt, req.style ?? null);
          }

          if (!out) {
            return { ok: false, error: 'no-result' as const };
          }
          if (out.startsWith('ERR:')) {
            const code = out.slice(4) as EngineErrorCode;
            setStatus('Motor listo');
            return { ok: false, error: KNOWN.includes(code) ? code : 'unexpected', detail: out };
          }
          if (out.startsWith('data:image')) {
            setStatus('Listo');
            return { ok: true, url: out, dataUrl: out };
          }
          if (out.startsWith('http')) {
            setStatus('Listo');
            return { ok: true, url: out };
          }
          return { ok: false, error: 'unexpected' as const, detail: out.slice(0, 120) };
        } catch (e) {
          return { ok: false, error: 'unexpected' as const, detail: String((e as Error)?.message ?? e) };
        } finally {
          setBusy(false);
        }
      }),
    [enqueue, waitReady],
  );

  /**
   * Mejora el prompt con el 🧠 del generador (misma sesión, en cola) y, si no
   * responde, con el enriquecedor local. Al terminar el motor queda libre.
   */
  const improve = useCallback(
    (prompt: string): Promise<{ text: string; source: 'engine' | 'local' } | null> =>
      enqueue(async () => {
        if (Platform.OS === 'web') return null;
        setBusy(true);
        setStatus('Mejorando idea');
        try {
          if (Devtools) {
            await waitReady(30000);
            const out = await Devtools.improve(prompt);
            if (out && out.trim().length > 3 && out.trim() !== prompt.trim()) {
              return { text: out.trim(), source: 'engine' as const };
            }
          }
          const local = enhancePrompt(prompt);
          return local && local !== prompt ? { text: local, source: 'local' as const } : null;
        } catch {
          const local = enhancePrompt(prompt);
          return local !== prompt ? { text: local, source: 'local' as const } : null;
        } finally {
          setBusy(false);
          setStatus('Motor listo');
        }
      }),
    [enqueue, waitReady],
  );

  const diagnose = useCallback(
    (): Promise<string> =>
      enqueue(async () => {
        if (!Devtools?.diagnose) return 'Diagnóstico no disponible en esta versión.';
        await waitReady(20000);
        try {
          return (await Devtools.diagnose()) || 'Sin datos.';
        } catch (e) {
          return `Error: ${String((e as Error)?.message ?? e)}`;
        }
      }),
    [enqueue, waitReady],
  );

  const value = useMemo<EngineContextValue>(
    () => ({ ready, busy, status, generate, improve, diagnose }),
    [ready, busy, status, generate, improve, diagnose],
  );

  return (
    <EngineContext.Provider value={value}>
      {children}
      {Platform.OS !== 'web' && (
        <View pointerEvents="none" style={styles.behind}>
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
            style={styles.webview}
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
  /**
   * La WebView debe tener tamaño REAL y estar dentro de la pantalla: con 1x1 px
   * o fuera de pantalla, Chromium la marca como oculta y el generador no
   * ejecuta el render (era la causa del timeout). Queda detrás de la interfaz
   * y casi transparente, pero con layout válido.
   */
  behind: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    zIndex: -1,
  },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
