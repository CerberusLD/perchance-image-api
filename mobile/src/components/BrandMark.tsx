import React from 'react';
import Svg, { Defs, LinearGradient, Path, Stop, Circle } from 'react-native-svg';

type Props = { size?: number };

/** Marca de la app: un prisma de luz sobre un círculo oscuro. */
export function BrandMark({ size = 36 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        <LinearGradient id="aetherRing" x1="0" y1="0" x2="64" y2="64">
          <Stop offset="0" stopColor="#8B5CF6" />
          <Stop offset="0.55" stopColor="#7C4DFF" />
          <Stop offset="1" stopColor="#22D3EE" />
        </LinearGradient>
        <LinearGradient id="aetherCore" x1="18" y1="14" x2="46" y2="50">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#C4B5FD" stopOpacity="0.75" />
        </LinearGradient>
      </Defs>
      <Circle cx="32" cy="32" r="29" stroke="url(#aetherRing)" strokeWidth="2.5" opacity="0.9" />
      <Circle cx="32" cy="32" r="21" fill="#0B0B12" stroke="url(#aetherRing)" strokeWidth="1" opacity="0.6" />
      <Path d="M32 15 L44 45 L32 38 L20 45 Z" fill="url(#aetherCore)" />
      <Path d="M32 38 L32 45" stroke="#0B0B12" strokeWidth="1.5" opacity="0.4" />
    </Svg>
  );
}
