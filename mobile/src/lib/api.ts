import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { API_BASE, API_FALLBACK, REQUEST_TIMEOUT_MS } from './config';

export type GenInput = {
  prompt: string;
  negativePrompt?: string;
  style?: string | null;
  resolution: string;
  seed?: number;
};

export type GenOutput = {
  uri: string;
  seed: number | null;
  durationMs: number;
};

export type EngineStatus = 'ready' | 'waking' | 'unreachable';

export type ApiErrorKind = 'timeout' | 'busy' | 'network' | 'server' | 'rejected' | 'unknown';

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'ApiError';
  }
}

/** Mensajes listos para el usuario. Nunca exponen el origen técnico. */
export const friendlyError = (kind: ApiErrorKind): string => {
  switch (kind) {
    case 'timeout':
      return 'El render tardó demasiado. Inténtalo otra vez.';
    case 'busy':
      return 'El motor está saturado. Espera unos segundos y reintenta.';
    case 'network':
      return 'Sin conexión con el motor. Revisa tu red.';
    case 'rejected':
      return 'Esa descripción no se pudo procesar. Prueba a reformularla.';
    case 'server':
      return 'Algo falló en el render. Suele resolverse reintentando.';
    default:
      return 'No se pudo completar la generación.';
  }
};

/** Texto para cada etapa de fallo del motor embebido (sin revelar el proveedor). */
export const engineErrorMessage = (code: string): string => {
  switch (code) {
    case 'no-socket':
    case 'no-page':
      return 'El motor todavía se está iniciando. Espera unos segundos y reintenta.';
    case 'no-ui':
      return 'El motor no terminó de cargar. Reintenta en unos segundos.';
    case 'no-result':
      return 'El render no llegó a completarse. Inténtalo otra vez.';
    case 'stale':
      return 'El motor no aplicó la nueva descripción. Reintenta la generación.';
    case 'busy':
      return 'El motor está ocupado con otra imagen. Espera un momento.';
    case 'engine-unavailable':
      return 'El motor no está disponible en esta versión.';
    default:
      return 'Algo falló en el render. Suele resolverse reintentando.';
  }
};

let customBase: string | null = null;

/** Permite apuntar la app a un motor propio sin recompilar. */
export function setCustomEngine(url: string | null): void {
  const clean = (url ?? '').trim().replace(/\/+$/, '');
  customBase = clean.length > 6 ? clean : null;
}

const bases = (): string[] => {
  if (customBase) return [customBase];
  return API_FALLBACK && API_FALLBACK !== API_BASE ? [API_BASE, API_FALLBACK] : [API_BASE];
};

const artworksDir = () => new Directory(Paths.document, 'artworks');

function ensureArtworkDir(): Directory {
  const dir = artworksDir();
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

type Attempt = { response: Response | null; aborted: boolean };

/** Intenta las bases en orden; solo pasa a la siguiente si falla la red. */
async function attempt(
  path: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Attempt> {
  for (const base of bases()) {
    try {
      const response = await fetch(`${base}${path}`, { ...init, signal });
      return { response, aborted: false };
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return { response: null, aborted: true };
    }
  }
  return { response: null, aborted: false };
}

/**
 * Lanza una generación y guarda el binario resultante en el dispositivo.
 * Nota deliberada: se pide la imagen como binario y nunca se lee información
 * de proveedor de la respuesta.
 */
export async function generateImage(input: GenInput): Promise<GenOutput> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const { response, aborted } = await attempt(
    '/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'image/jpeg' },
      body: JSON.stringify({
        prompt: input.prompt,
        negative_prompt: input.negativePrompt ?? '',
        style: input.style ?? null,
        resolution: input.resolution,
        seed: input.seed ?? -1,
        response_format: 'jpeg',
      }),
    },
    controller.signal,
  );
  clearTimeout(timer);

  if (aborted) throw new ApiError('timeout', friendlyError('timeout'));
  if (!response) throw new ApiError('network', friendlyError('network'));

  if (!response.ok) {
    if (response.status === 400 || response.status === 422) {
      throw new ApiError('rejected', friendlyError('rejected'));
    }
    if (response.status === 429 || response.status === 502 || response.status === 503) {
      throw new ApiError('busy', friendlyError('busy'));
    }
    throw new ApiError('server', friendlyError('server'));
  }

  const durationMs = Date.now() - started;
  const id = newId();

  if (Platform.OS === 'web') {
    // En web no hay sistema de archivos: guardamos un data URL para que el
    // historial sobreviva a una recarga (localStorage).
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new ApiError('unknown', friendlyError('unknown')));
      reader.readAsDataURL(blob);
    });
    return { uri: dataUrl, seed: input.seed && input.seed > 0 ? input.seed : null, durationMs };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const dir = ensureArtworkDir();
  const file = new File(dir, `${id}.jpg`);
  try {
    file.create({ intermediates: true, overwrite: true });
  } catch {
    // si ya existe, seguimos: write lo sobrescribe
  }
  file.write(bytes);

  return { uri: file.uri, seed: input.seed && input.seed > 0 ? input.seed : null, durationMs };
}

/** Comprueba que el motor responde. Se usa para el indicador de estado. */
export async function checkEngine(timeoutMs = 12_000): Promise<EngineStatus> {
  let sawResponse = false;
  for (const base of bases()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/health`, { signal: controller.signal });
      if (!res.ok) continue;
      sawResponse = true;
      const data = (await res.json()) as { status?: string };
      if (data?.status === 'ok') return 'ready';
    } catch {
      // probamos la siguiente base
    } finally {
      clearTimeout(timer);
    }
  }
  return sawResponse ? 'waking' : 'unreachable';
}

/** Despierta el motor en segundo plano (arranque en frío). */
export function warmEngine(): void {
  const base = bases()[0];
  fetch(`${base}/health`).catch(() => undefined);
}

/** Guarda un data URL base64 como archivo local de la app. */
export async function saveDataUrl(dataUrl: string): Promise<{ uri: string }> {
  const match = /^data:image\/[a-z]+;base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new ApiError('server', friendlyError('server'));
  const base64 = match[1];
  if (Platform.OS === 'web') return { uri: dataUrl };
  const dir = ensureArtworkDir();
  const file = new File(dir, `${newId()}.jpg`);
  try {
    file.create({ intermediates: true, overwrite: true });
  } catch {
    // si ya existe, write lo sobrescribe
  }
  file.write(base64, { encoding: 'base64' });
  return { uri: file.uri };
}

/** Descarga una imagen remota al almacenamiento local de la app. */
export async function downloadToFile(url: string): Promise<{ uri: string }> {
  const dir = ensureArtworkDir();
  const name = `${newId()}.jpg`;
  if (Platform.OS === 'web') return { uri: url };
  const target = new File(dir, name);
  try {
    const out = await File.downloadFileAsync(url, target, { idempotent: true });
    return { uri: out.uri };
  } catch {
    throw new ApiError('network', friendlyError('network'));
  }
}

/** Borra un archivo local de una creación. */
export function deleteArtworkFile(uri: string): void {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // silencioso: el archivo pudo desaparecer
  }
}
