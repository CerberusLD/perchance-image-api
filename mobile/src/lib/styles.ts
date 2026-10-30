/**
 * Estilos visuales curados.
 * `id` debe coincidir EXACTAMENTE con el nombre aceptado por el backend.
 */
export type StylePreset = {
  id: string | null;
  label: string;
  emoji: string;
  hint: string;
  tint: [string, string];
};

export const STYLE_PRESETS: StylePreset[] = [
  { id: null, label: 'Libre', emoji: '✦', hint: 'Sin estilo adicional', tint: ['#2A2A38', '#14141C'] },
  { id: 'Cinematic', label: 'Cine', emoji: '🎬', hint: 'Luz dramática, lentes de cine', tint: ['#4C1D95', '#0F172A'] },
  { id: 'Professional Photo', label: 'Foto pro', emoji: '📷', hint: 'Retrato nítido y realista', tint: ['#1E3A8A', '#0B1220'] },
  { id: 'Digital Painting', label: 'Pintura', emoji: '🖌️', hint: 'Pinceladas ricas en color', tint: ['#7C2D12', '#1C1917'] },
  { id: 'Oil Painting', label: 'Óleo', emoji: '🎨', hint: 'Textura clásica al óleo', tint: ['#78350F', '#1A1208'] },
  { id: 'Anime', label: 'Anime', emoji: '🌸', hint: 'Estilo japonés vibrante', tint: ['#BE185D', '#2A0E20'] },
  { id: 'Studio Ghibli', label: 'Ghibli', emoji: '🍃', hint: 'Fondos cálidos, pintados', tint: ['#166534', '#0C1E14'] },
  { id: 'Concept Art', label: 'Concept art', emoji: '🏛️', hint: 'Diseño de mundos y personajes', tint: ['#3730A3', '#0B1020'] },
  { id: 'Fantasy Portrait', label: 'Fantasía', emoji: '🧝', hint: 'Retratos épicos iluminados', tint: ['#5B21B6', '#160B2E'] },
  { id: 'Watercolor', label: 'Acuarela', emoji: '💧', hint: 'Tinta suave sobre papel', tint: ['#0E7490', '#0A1A20'] },
  { id: 'Pixel Art', label: 'Pixel', emoji: '🕹️', hint: 'Retro de 16 bits', tint: ['#9D174D', '#160A14'] },
  { id: '3D Isometric Icon', label: '3D icono', emoji: '🧊', hint: 'Render limpio isométrico', tint: ['#0369A1', '#081C28'] },
  { id: 'Neon Vintage Anime', label: 'Neón retro', emoji: '🌆', hint: 'Anime ochentero con neón', tint: ['#BE123C', '#1B0A24'] },
  { id: 'Manga', label: 'Manga', emoji: '📖', hint: 'Blanco y negro entintado', tint: ['#3F3F46', '#101014'] },
  { id: 'Pencil', label: 'Lápiz', emoji: '✏️', hint: 'Grafito con grano', tint: ['#52525B', '#131316'] },
  { id: 'Claymation', label: 'Plastilina', emoji: '🫧', hint: 'Arcilla con volumen suave', tint: ['#B45309', '#1C1208'] },
  { id: 'Fantasy Landscape', label: 'Paisaje', emoji: '🏔️', hint: 'Valles, luces y profundidad', tint: ['#065F46', '#0A1F19'] },
  { id: 'Tattoo Design', label: 'Tatuaje', emoji: '🐉', hint: 'Línea fuerte, alto contraste', tint: ['#1F2937', '#0C0F14'] },
];

/**
 * Añade al texto las palabras clave del estilo, igual que hace el motor con el
 * parámetro `style`. Se usa en el modo sin servidor, donde solo se envía texto.
 */
export const withStyle = (prompt: string, id?: string | null): string => {
  const preset = STYLE_PRESETS.find((s) => s.id === (id ?? null));
  if (!preset || !preset.id) return prompt;
  return `${prompt}, ${preset.hint.toLowerCase()}`;
};

export const styleLabel = (id?: string | null) =>
  STYLE_PRESETS.find((s) => s.id === (id ?? null))?.label ?? 'Libre';

export const styleHint = (id?: string | null) =>
  STYLE_PRESETS.find((s) => s.id === (id ?? null))?.hint ?? 'Estilo libre';

export const styleTint = (id?: string | null): [string, string] =>
  STYLE_PRESETS.find((s) => s.id === (id ?? null))?.tint ?? ['#2A2A38', '#14141C'];
