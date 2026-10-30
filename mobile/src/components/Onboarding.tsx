import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { BrandMark } from '@/components/BrandMark';
import { PrimaryButton } from '@/components/Buttons';
import { FREE_DAILY_CREDITS } from '@/lib/config';
import { readJSON, STORAGE_KEYS, writeJSON } from '@/lib/storage';
import { colors, radius } from '@/lib/theme';
import { useApp } from '@/store/app';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'color-wand-outline' as const,
    title: 'Describe lo que imaginas',
    body: 'Escribe una idea, por simple o extraña que sea. En segundos la verás convertida en una imagen lista para guardar.',
    tint: ['rgba(124,77,255,0.35)', 'rgba(7,7,11,0)'] as const,
  },
  {
    icon: 'options-outline' as const,
    title: 'Dirige el resultado',
    body: 'Elige entre 18 estilos, seis formatos y ajustes finos como la semilla o el prompt negativo. Tú marcas el rumbo.',
    tint: ['rgba(34,211,238,0.28)', 'rgba(7,7,11,0)'] as const,
  },
  {
    icon: 'albums-outline' as const,
    title: 'Tu colección, en tu móvil',
    body: `Todo lo que creas se guarda en la app, sin subir nada. Tienes ${FREE_DAILY_CREDITS} creaciones gratis cada día.`,
    tint: ['rgba(244,114,182,0.25)', 'rgba(7,7,11,0)'] as const,
  },
];

export function OnboardingGate() {
  const { hydrated } = useApp();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    readJSON<boolean>(STORAGE_KEYS.onboarding, false).then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const close = async () => {
    setVisible(false);
    await writeJSON(STORAGE_KEYS.onboarding, true);
  };

  const goNext = () => {
    if (index === SLIDES.length - 1) {
      close();
      return;
    }
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    setIndex((i) => i + 1);
  };

  const slide = SLIDES[index];

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.root}>
        <LinearGradient colors={['#0A0714', '#07070B', '#05050A']} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={slide.tint} style={[StyleSheet.absoluteFill, { top: -120, height: 460 }]} />

        <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
          <BrandMark size={30} />
          <AppText variant="label" color={colors.textMuted}>
            Aether
          </AppText>
          <View style={{ flex: 1 }} />
          {index < SLIDES.length - 1 && (
            <AppText variant="caption" color={colors.textDim} onPress={close}>
              Saltar
            </AppText>
          )}
        </View>

        <Animated.View style={[styles.body, { opacity: fade }]}>
          <View style={styles.iconRing}>
            <LinearGradient
              colors={['#7C4DFF', '#22D3EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCore}
            >
              <Ionicons name={slide.icon} size={28} color="#fff" />
            </LinearGradient>
          </View>
          <AppText variant="display" align="center" style={styles.title}>
            {slide.title}
          </AppText>
          <AppText variant="body" color={colors.textDim} align="center" style={styles.text}>
            {slide.body}
          </AppText>
        </Animated.View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <PrimaryButton
            label={index === SLIDES.length - 1 ? 'Empezar a crear' : 'Continuar'}
            icon={index === SLIDES.length - 1 ? 'sparkles' : 'arrow-forward'}
            onPress={goNext}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 18,
  },
  iconRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: 8,
  },
  iconCore: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { maxWidth: SCREEN_W - 64 },
  text: { maxWidth: 330 },
  footer: { paddingHorizontal: 24, gap: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  dotActive: { width: 22, backgroundColor: colors.accentSoft },
});
