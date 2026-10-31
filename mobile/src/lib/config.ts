/**
 * Aether — configuración de marca y endpoints.
 *
 * Punto único de cambio para renombrar la app o apuntar a otro backend.
 * La URL debe ser SIEMPRE un host neutro (proxy propio). Nunca se muestra
 * al usuario en la interfaz.
 */
export const BRAND = {
  name: 'Aether',
  studio: 'Aether Studio',
  tagline: 'Imagina. Describe. Obtén.',
  version: '1.0.0',
} as const;

// Build de pruebas: apunta al motor limpio de la red local (ver README).
// Para publicar, cambia esto por tu proxy neutro y pon ENABLE_FALLBACK=false.
const DEFAULT_BASE = 'http://192.168.55.120:8004';

/**
 * Endpoint secundario de emergencia: solo se usa si el principal no responde
 * a nivel de red (por ejemplo, si el proxy neutro aún no está desplegado).
 * Desactívalo en builds de producción con EXPO_PUBLIC_ENABLE_FALLBACK=false.
 */
const FALLBACK_BASE = 'https://perchance-image-api-vn4j.onrender.com';
export const ENABLE_FALLBACK = process.env.EXPO_PUBLIC_ENABLE_FALLBACK === 'true';

const trim = (url: string) => url.replace(/\/+$/, '');

export const API_BASE = trim(process.env.EXPO_PUBLIC_API_BASE || DEFAULT_BASE);
export const API_FALLBACK = ENABLE_FALLBACK ? trim(FALLBACK_BASE) : null;

/** Tiempo máximo de espera por imagen (la generación puede tardar). */
export const REQUEST_TIMEOUT_MS = 240_000;

/**
 * Edición única: generaciones sin límite para todos.
 * Se mantiene la constante para que la interfaz sepa que no hay cuota.
 */
export const UNLIMITED = true;

/**
 * Canal de actualizaciones. `EXPO_PUBLIC_UNLIMITED=1` solo lo usan builds
 * antiguos de la edición separada; la app actual mira las releases normales.
 */
export const UPDATE_CHANNEL: 'main' | 'unlimited' =
  process.env.EXPO_PUBLIC_UNLIMITED === '1' ? 'unlimited' : 'main';

/** Sin cuota diaria: el contador queda desactivado. */
export const FREE_DAILY_CREDITS = Number.POSITIVE_INFINITY;

/** Créditos extra que otorgará un anuncio recompensado (fase anuncios). */
export const REWARDED_AD_CREDITS = 5;

/** Mostrar el bloque de anuncios recompensados (se activa al integrar el SDK). */
export const ADS_ENABLED = false;
