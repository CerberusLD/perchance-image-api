import { Platform } from 'react-native';

/**
 * Sistema de diseño — tema oscuro "obsidiana".
 * Paleta profunda con un degradado violeta→cian reservado para acciones clave.
 */
export const colors = {
  // Fondos
  void: '#07070B',
  ink: '#0B0B11',
  surface: '#111118',
  surfaceHi: '#17171F',
  surfaceGlass: 'rgba(23,23,31,0.72)',

  // Bordes
  border: 'rgba(255,255,255,0.08)',
  borderHi: 'rgba(255,255,255,0.16)',

  // Texto
  text: '#F5F5F8',
  textDim: '#B6B6C6',
  textMuted: '#8A8A9E',

  // Acentos
  accent: '#8B5CF6',
  accentSoft: '#A78BFA',
  accentGlow: 'rgba(139,92,246,0.28)',
  cyan: '#22D3EE',
  pink: '#F472B6',
  amber: '#FBBF24',
  success: '#34D399',
  danger: '#F87171',
  overlay: 'rgba(3,3,6,0.78)',
} as const;

export const gradients = {
  primary: ['#7C4DFF', '#8B5CF6', '#22D3EE'] as const,
  aurora: ['#1B1040', '#0B0B11', '#07070B'] as const,
  card: ['rgba(38,38,52,0.9)', 'rgba(17,17,24,0.95)'] as const,
  fade: ['transparent', 'rgba(7,7,11,0.9)', '#07070B'] as const,
  shimmer: ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)'] as const,
};

export const radius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const fonts = {
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
} as const;

/** Sombra suave multiplataforma. */
export const shadow = (elevation = 12) =>
  Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.45,
      shadowRadius: elevation,
      shadowOffset: { width: 0, height: elevation / 2 },
    },
    android: { elevation },
    default: {},
  }) as object;

/** Glow de acento (para botones primarios). */
export const glow = {
  shadowColor: colors.accent,
  shadowOpacity: 0.55,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 10,
} as const;

export type ThemeColor = keyof typeof colors;
