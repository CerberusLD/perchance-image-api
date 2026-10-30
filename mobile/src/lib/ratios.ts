export type Ratio = {
  id: string;
  label: string;
  resolution: string;
  aspect: number;
};

/** El motor limita el lado mayor y conserva la proporción. */
export const RATIOS: Ratio[] = [
  { id: '1:1', label: 'Cuadrado', resolution: '768x768', aspect: 1 },
  { id: '4:5', label: 'Retrato', resolution: '768x960', aspect: 0.8 },
  { id: '3:4', label: 'Vertical', resolution: '768x1024', aspect: 0.75 },
  { id: '9:16', label: 'Historia', resolution: '768x1365', aspect: 0.5625 },
  { id: '3:2', label: 'Foto', resolution: '1152x768', aspect: 1.5 },
  { id: '16:9', label: 'Cine', resolution: '1365x768', aspect: 1.7778 },
];

export const ratioById = (id: string): Ratio => RATIOS.find((r) => r.id === id) ?? RATIOS[0];

export const ratioForSize = (w: number, h: number): string => {
  const a = w / h;
  let best = RATIOS[0];
  let delta = Infinity;
  for (const r of RATIOS) {
    const d = Math.abs(r.aspect - a);
    if (d < delta) {
      delta = d;
      best = r;
    }
  }
  return best.id;
};
