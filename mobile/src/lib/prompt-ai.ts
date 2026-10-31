/**
 * Mejora de prompt con el modelo local (integrado en la app).
 *
 * Flujo que pidió el producto:
 *   1. el prompt del usuario (cualquier idioma) se traduce al inglés
 *   2. ese texto se pasa al modelo empaquetado en el APK
 *   3. lo que devuelve el modelo sustituye al prompt en el campo de texto
 *
 * Sin servidores ni APIs externas de mejora: solo la traducción (que ya viaja
 * silenciosa) toca la red.
 */

import { NativeModules, Platform } from 'react-native';

import { ensureEnglish } from './translate';

type EnhancerBridge = {
  enhance: (text: string) => Promise<string | null>;
  warmup?: () => Promise<boolean>;
};

const Enhancer: EnhancerBridge | undefined = (NativeModules as any)?.PromptEnhancer;

export type ImproveResult = {
  text: string;
  source: 'model' | 'local';
  translated: boolean;
  english: string;
};

/** Carga el modelo en segundo plano (primera vez ~1-2 s). */
export function warmPromptModel(): void {
  if (Platform.OS === 'web') return;
  try {
    Enhancer?.warmup?.().catch(() => undefined);
  } catch {
    // sin módulo nativo (build web): se ignora
  }
}

/**
 * Traduce al inglés y mejora con el modelo local.
 * Devuelve `null` si no hay modelo disponible; el llamador decide el respaldo.
 */
export async function improveWithModel(prompt: string): Promise<ImproveResult | null> {
  if (Platform.OS === 'web' || !Enhancer?.enhance) return null;

  const { text: english, translated } = await ensureEnglish(prompt);
  try {
    const out = await Enhancer.enhance(english);
    if (!out || out.trim().length < 20) return null;
    return { text: out.trim(), source: 'model', translated, english };
  } catch {
    return null;
  }
}
