import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Fondo atmosférico: degradados suaves y orbes de color.
 * Sin blur costoso: solo gradientes apilados.
 */
export function AuroraBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#0A0714', '#07070B', '#05050A']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbViolet]} />
      <View style={[styles.orb, styles.orbCyan]} />
      <View style={[styles.orb, styles.orbPink]} />
      <LinearGradient
        colors={['rgba(7,7,11,0.15)', 'rgba(7,7,11,0.92)']}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute', borderRadius: 999 },
  orbViolet: {
    width: 420,
    height: 420,
    top: -170,
    left: -140,
    backgroundColor: 'rgba(124,77,255,0.30)',
    opacity: 0.75,
  },
  orbCyan: {
    width: 300,
    height: 300,
    top: 120,
    right: -160,
    backgroundColor: 'rgba(34,211,238,0.14)',
    opacity: 0.7,
  },
  orbPink: {
    width: 260,
    height: 260,
    bottom: -120,
    left: 40,
    backgroundColor: 'rgba(244,114,182,0.10)',
  },
});
