/**
 * Estilos visuales del generador, con su nombre EXACTO como `id`.
 *
 * El motor selecciona ese nombre en el `<select>` del propio generador, así que
 * el `id` no se puede traducir ni adivinar: debe coincidir carácter a carácter
 * con la opción de la página (salvo "Libre", que es `No style`).
 */

export type StyleGroup =
  | 'Básicos'
  | 'Anime'
  | 'Pintura'
  | 'Ilustración'
  | '3D'
  | 'Fotografía'
  | 'Vintage'
  | 'Fantasía';

export type StylePreset = {
  id: string | null;
  label: string;
  emoji: string;
  hint: string;
  group: StyleGroup;
  tint: [string, string];
};

const TINTS: Record<StyleGroup, [string, string]> = {
  Básicos: ['#4C1D95', '#0F172A'],
  Anime: ['#BE185D', '#2A0E20'],
  Pintura: ['#78350F', '#1A1208'],
  Ilustración: ['#0E7490', '#0A1A20'],
  '3D': ['#0369A1', '#081C28'],
  Fotografía: ['#1E3A8A', '#0B1220'],
  Vintage: ['#9D174D', '#160A14'],
  Fantasía: ['#065F46', '#0A1F19'],
};

const s = (
  id: string,
  label: string,
  emoji: string,
  group: StyleGroup,
  hint?: string,
): StylePreset => ({
  id,
  label,
  emoji,
  hint: hint ?? `Estilo ${group.toLowerCase()}`,
  group,
  tint: TINTS[group],
});

export const STYLE_GROUPS: StyleGroup[] = [
  'Básicos',
  'Anime',
  'Pintura',
  'Ilustración',
  '3D',
  'Fotografía',
  'Vintage',
  'Fantasía',
];

export const STYLE_PRESETS: StylePreset[] = [
  // ---------------------------------------------------------------- Básicos
  {
    id: null,
    label: 'Libre',
    emoji: '✦',
    hint: 'Sin estilo adicional',
    group: 'Básicos',
    tint: ['#2A2A38', '#14141C'],
  },
  s('Cinematic', 'Cine', '🎬', 'Básicos', 'Luz dramática, lentes de cine'),
  s('Casual Photo', 'Foto casual', '📸', 'Básicos', 'Instantánea natural'),
  s('Professional Photo', 'Foto pro', '📷', 'Básicos', 'Retrato nítido y realista'),
  s('Digital Painting', 'Pintura digital', '🖌️', 'Básicos', 'Pinceladas ricas en color'),
  s('Oil Painting', 'Óleo', '🎨', 'Básicos', 'Textura clásica al óleo'),
  s('Concept Art', 'Concept art', '🏛️', 'Básicos', 'Diseño de mundos y personajes'),
  s('Painterly', 'Pictórico', '🖼️', 'Básicos'),

  // ------------------------------------------------------------------- Anime
  s('Anime', 'Anime', '🌸', 'Anime', 'Estilo japonés vibrante'),
  s('Painted Anime', 'Anime pintado', '🎎', 'Anime'),
  s('Drawn Anime', 'Anime dibujado', '✒️', 'Anime'),
  s('Anime Screencap', 'Fotograma anime', '📺', 'Anime'),
  s('Cute Anime', 'Anime cute', '🐰', 'Anime'),
  s('Soft Anime', 'Anime suave', '🌷', 'Anime'),
  s('Vintage Anime', 'Anime vintage', '📼', 'Anime'),
  s('Neon Vintage Anime', 'Neón retro', '🌆', 'Anime', 'Anime ochentero con neón'),
  s('50s Infomercial Anime', 'Anime años 50', '📻', 'Anime'),
  s('Manga', 'Manga', '📖', 'Anime', 'Blanco y negro entintado'),
  s('Waifu', 'Waifu', '💗', 'Anime'),
  s('YuGiOh Art', 'Yu-Gi-Oh', '🃏', 'Anime'),
  s('3D Pokemon', 'Pokémon 3D', '⚡', 'Anime'),
  s('Painted Pokemon', 'Pokémon pintado', '🎨', 'Anime'),
  s('2D Pokemon', 'Pokémon 2D', '🎮', 'Anime'),

  // ----------------------------------------------------------------- Pintura
  s('Oil Painting - Realism', 'Óleo realista', '🖌️', 'Pintura'),
  s('Oil Painting - Old', 'Óleo antiguo', '🏺', 'Pintura'),
  s('Oil Painting - 70s Pulp', 'Óleo pulp 70s', '📙', 'Pintura'),
  s('Watercolor', 'Acuarela', '💧', 'Pintura', 'Tinta suave sobre papel'),
  s('Nihonga Painting', 'Nihonga', '🎋', 'Pintura'),
  s('Traditional Japanese', 'Japonés trad.', '🏯', 'Pintura'),
  s('Fantasy Painting', 'Pintura fantástica', '🪄', 'Pintura'),
  s('Cartoon', 'Cartoon', '🎈', 'Pintura'),
  s('Claymation', 'Plastilina', '🫧', 'Pintura', 'Arcilla con volumen suave'),

  // ------------------------------------------------------------ Ilustración
  s('Illustration', 'Ilustración', '🖊️', 'Ilustración'),
  s('Cute Illustration', 'Ilustración cute', '🧸', 'Ilustración'),
  s('Flat Illustration', 'Ilustración plana', '🟦', 'Ilustración'),
  s('Concept Sketch', 'Boceto concept', '📐', 'Ilustración'),
  s('Disney Sketch', 'Boceto Disney', '🏰', 'Ilustración'),
  s('Pencil', 'Lápiz', '✏️', 'Ilustración', 'Grafito con grano'),
  s('Crayon Drawing', 'Cera', '🖍️', 'Ilustración'),
  s('Pixel Art', 'Pixel art', '🕹️', 'Ilustración', 'Retro de 16 bits'),
  s('Tattoo Design', 'Tatuaje', '🐉', 'Ilustración', 'Línea fuerte, alto contraste'),
  s('MTG Card', 'Carta MTG', '🃏', 'Ilustración'),
  s('Game Art Icon', 'Icono de juego', '👾', 'Ilustración'),
  s('Digital Painting Icon', 'Icono pintado', '🖌️', 'Ilustración'),
  s('Concept Art Icon', 'Icono concept', '🏛️', 'Ilustración'),
  s('Flat Style Icon', 'Icono plano', '⬛', 'Ilustración'),
  s('Flat Style Logo', 'Logo plano', '🔷', 'Ilustración'),

  // ---------------------------------------------------------------------- 3D
  s('3D Disney Character', 'Disney 3D', '🏰', '3D'),
  s('2D Disney Character', 'Disney 2D', '🎠', '3D'),
  s('Cute Figurine', 'Figurina', '🧸', '3D'),
  s('3D Emoji', 'Emoji 3D', '😀', '3D'),
  s('3D Isometric Icon', 'Icono 3D', '🧊', '3D', 'Render limpio isométrico'),
  s('Cute 3D Icon', 'Icono 3D cute', '🍭', '3D'),
  s('Cute 3D Icon Set', 'Set iconos 3D', '🎁', '3D'),

  // -------------------------------------------------------------- Fotografía
  s('1990s Photo', 'Foto años 90', '📷', 'Fotografía'),
  s('1980s Photo', 'Foto años 80', '📷', 'Fotografía'),
  s('1970s Photo', 'Foto años 70', '📷', 'Fotografía'),
  s('1960s Photo', 'Foto años 60', '📷', 'Fotografía'),
  s('1950s Photo', 'Foto años 50', '📷', 'Fotografía'),
  s('1940s Photo', 'Foto años 40', '📷', 'Fotografía'),
  s('1930s Photo', 'Foto años 30', '📷', 'Fotografía'),
  s('1920s Photo', 'Foto años 20', '📷', 'Fotografía'),
  s('Cursed Photo', 'Foto maldita', '😈', 'Fotografía'),

  // ------------------------------------------------------------------ Vintage
  s('Vintage Comic', 'Cómic vintage', '💥', 'Vintage'),
  s('Franco-Belgian Comic', 'Cómic franco-belga', '🇧🇪', 'Vintage'),
  s('Tintin Comic', 'Cómic Tintín', '🚀', 'Vintage'),
  s('Medieval', 'Medieval', '⚔️', 'Vintage'),
  s('50s Enamel Sign', 'Letrero años 50', '🪧', 'Vintage'),
  s('Vintage Pulp Art', 'Pulp vintage', '📚', 'Vintage'),

  // ----------------------------------------------------------------- Fantasía
  s('Studio Ghibli', 'Ghibli', '🍃', 'Fantasía', 'Fondos cálidos, pintados'),
  s('Fantasy Landscape', 'Paisaje', '🏔️', 'Fantasía', 'Valles, luces y profundidad'),
  s('Fantasy Portrait', 'Fantasía', '🧝', 'Fantasía', 'Retratos épicos iluminados'),
  s('Fantasy World Map', 'Mapa de mundo', '🗺️', 'Fantasía'),
  s('Fantasy City Map', 'Mapa de ciudad', '🏙️', 'Fantasía'),
  s('Old World Map', 'Mapa antiguo', '📜', 'Fantasía'),
  s('Furry - Oil', 'Furry óleo', '🐾', 'Fantasía'),
  s('Furry - Cinematic', 'Furry cine', '🐾', 'Fantasía'),
  s('Furry - Painted', 'Furry pintado', '🐾', 'Fantasía'),
  s('Furry - Drawn', 'Furry dibujado', '🐾', 'Fantasía'),
];

/** Los que aparecen en la barra rápida de la pantalla Crear. */
export const POPULAR_STYLES: (string | null)[] = [
  null,
  'Cinematic',
  'Professional Photo',
  'Anime',
  'Studio Ghibli',
  'Oil Painting',
  'Concept Art',
  'Pixel Art',
];

/** Añade al texto las palabras clave del estilo (solo para el motor HTTP). */
export const withStyle = (prompt: string, id?: string | null): string => {
  const preset = STYLE_PRESETS.find((p) => p.id === (id ?? null));
  if (!preset || !preset.id) return prompt;
  return `${prompt}, ${preset.hint.toLowerCase()}`;
};

export const styleLabel = (id?: string | null) =>
  STYLE_PRESETS.find((p) => p.id === (id ?? null))?.label ?? 'Libre';

export const styleHint = (id?: string | null) =>
  STYLE_PRESETS.find((p) => p.id === (id ?? null))?.hint ?? 'Estilo libre';

export const styleTint = (id?: string | null): [string, string] =>
  STYLE_PRESETS.find((p) => p.id === (id ?? null))?.tint ?? ['#2A2A38', '#14141C'];

export const stylesByGroup = (): { group: StyleGroup; items: StylePreset[] }[] =>
  STYLE_GROUPS.map((group) => ({
    group,
    items: STYLE_PRESETS.filter((p) => p.group === group),
  })).filter((g) => g.items.length > 0);
