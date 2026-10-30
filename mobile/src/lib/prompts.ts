export type PromptIdea = { text: string; tag: string };

/** Semillas de inspiración: frases cortas y evocadoras. */
export const PROMPT_IDEAS: PromptIdea[] = [
  { tag: 'Retrato', text: 'Retrato de una mujer con abrigo de lana, luz de ventana al atardecer, mirada serena' },
  { tag: 'Retrato', text: 'Hombre mayor con arrugas marcadas, iluminación Rembrandt, fondo de estudio oscuro' },
  { tag: 'Retrato', text: 'Bailarina cubierta de polvo dorado, congelada en el aire, fondo negro' },
  { tag: 'Paisaje', text: 'Valle nevado al amanecer con niebla baja y un río turquesa serpenteando' },
  { tag: 'Paisaje', text: 'Bosque de bambú con rayos de sol atravesando la bruma, tonos verdes profundos' },
  { tag: 'Paisaje', text: 'Desierto de dunas rojas bajo dos lunas, cielo violeta, silencio absoluto' },
  { tag: 'Ciudad', text: 'Callejón de neón bajo la lluvia, reflejos en el asfalto, niebla urbana' },
  { tag: 'Ciudad', text: 'Estación de tren futurista de mármol blanco, viajeros con paraguas transparentes' },
  { tag: 'Ciudad', text: 'Azotea de Tokio al anochecer, luces bokeh, aire cálido de verano' },
  { tag: 'Producto', text: 'Frasco de perfume de cristal sobre piedra mojada, gotas, luz lateral dramática' },
  { tag: 'Producto', text: 'Zapatilla deportiva flotando entre cintas de color, fondo minimalista gris' },
  { tag: 'Producto', text: 'Taza de café humeante en mesa de madera, luz de mañana, sombras largas' },
  { tag: 'Anime', text: 'Chica con paraguas rojo esperando el tren, lluvia, estilo anime cálido' },
  { tag: 'Anime', text: 'Guerrero de armadura plateada en un campo de flores blancas, cielo inmenso' },
  { tag: 'Anime', text: 'Tienda de ramen de noche, farolillos rojos, vapor y luces colgantes' },
  { tag: 'Fantasía', text: 'Biblioteca infinita con escaleras flotantes y polvo iluminado por velas' },
  { tag: 'Fantasía', text: 'Dragón de cristal dormido entre montañas, aurora boreal de fondo' },
  { tag: 'Fantasía', text: 'Hechicera anciana tejiendo constelaciones con hilos de luz' },
  { tag: 'Abstracto', text: 'Formas líquidas cromadas sobre fondo negro, reflejos iridiscentes, macro' },
  { tag: 'Abstracto', text: 'Tinta violeta y cian expandiéndose en agua, alto contraste, textura fina' },
  { tag: 'Abstracto', text: 'Escultura de luz geométrica flotando en un vacío infinito' },
  { tag: 'Animales', text: 'Leopardo de las nieves en un risco, mirada directa, nieve cayendo' },
  { tag: 'Animales', text: 'Colibrí detenido en el aire junto a una flor roja, alas translúcidas' },
  { tag: 'Animales', text: 'Zorro ártico durmiendo enroscado, luz azul de invierno' },
];

export const PROMPT_TAGS = Array.from(new Set(PROMPT_IDEAS.map((p) => p.tag)));

export const randomIdeas = (count: number, tag?: string): PromptIdea[] => {
  const pool = tag ? PROMPT_IDEAS.filter((p) => p.tag === tag) : [...PROMPT_IDEAS];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
};

/** Enriquecedor local: se usa si el 🧠 del generador no responde a tiempo. */
export const enhancePrompt = (prompt: string, styleHint?: string): string => {
  const base = prompt.trim().replace(/[.,;\s]+$/, '');
  if (!base) return prompt;

  const lower = base.toLowerCase();
  const add: string[] = [];
  const has = (needle: string) => lower.includes(needle);

  if (!has('luz') && !has('light')) add.push('luz natural suave con sombras marcadas');
  if (!has('detalle') && !has('detail')) add.push('detalle nítido en primer plano');
  if (!has('composici') && !has('composition')) add.push('composición equilibrada, regla de tercios');
  if (!has('color') && !has('paleta')) add.push('paleta coherente y saturada con moderación');
  if (styleHint) add.push(styleHint.toLowerCase());
  if (add.length === 0) add.push('acabado pulido, alta resolución');

  const result = `${base}, ${add.join(', ')}`;
  return result.length > 690 ? result.slice(0, 690) : result;
};

export const NEGATIVE_PRESETS = [
  'blurry, low quality, deformed, extra fingers',
  'text, watermark, logo, signature',
  'oversaturated, plastic skin, harsh flash',
];
