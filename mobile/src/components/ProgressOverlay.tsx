import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { GhostButton } from '@/components/Buttons';
import { colors, radius } from '@/lib/theme';

const STAGES = [
  'Interpretando tu idea',
  'Componiendo la escena',
  'Ajustando la iluminación',
  'Puliendo texturas y detalles',
  'Revelando la imagen',
];

type Props = {
  visible: boolean;
  prompt: string;
  onCancel: () => void;
};

export function ProgressOverlay({ visible, prompt, onCancel }: Props) {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setStage(0);
      setElapsed(0);
      return;
    }
    const stageTimer = setInterval(() => {
      setStage((s) => (s + 1) % STAGES.length);
    }, 4200);
    const clock = setInterval(() => setElapsed((e) => e + 1), 1000);

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();

    const sweepLoop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    sweepLoop.start();

    return () => {
      clearInterval(stageTimer);
      clearInterval(clock);
      pulseLoop.stop();
      sweepLoop.stop();
    };
  }, [visible, pulse, sweep]);

  const ringScale = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.65] }),
    [pulse],
  );
  const ringOpacity = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    [pulse],
  );
  const sweepX = useMemo(
    () => sweep.interpolate({ inputRange: [0, 1], outputRange: [-160, 240] }),
    [sweep],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
        <LinearGradient
          colors={['rgba(5,5,10,0.96)', 'rgba(10,7,20,0.98)']}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.center}>
          <View style={styles.orbWrap}>
            <Animated.View
              style={[
                styles.ring,
                { transform: [{ scale: ringScale }], opacity: ringOpacity },
              ]}
            />
            <LinearGradient
              colors={['#7C4DFF', '#8B5CF6', '#22D3EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.core}
            >
              <Ionicons name="sparkles" size={26} color="#fff" />
            </LinearGradient>
          </View>

          <AppText variant="title" align="center" style={{ marginTop: 26 }}>
            {STAGES[stage]}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} align="center" style={styles.prompt} numberOfLines={3}>
            {prompt}
          </AppText>

          <View style={styles.track}>
            <Animated.View style={[styles.sweep, { transform: [{ translateX: sweepX }] }]}>
              <LinearGradient
                colors={['rgba(139,92,246,0)', '#8B5CF6', '#22D3EE', 'rgba(34,211,238,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>

          <AppText variant="micro" color={colors.textMuted} style={{ marginTop: 10 }}>
            {elapsed}s · suele tardar entre 8 y 40 segundos
          </AppText>
        </View>

        <View style={styles.footer}>
          <GhostButton label="Cancelar" icon="close" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  center: { alignItems: 'center', width: '100%' },
  orbWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
  },
  core: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  prompt: { marginTop: 8, maxWidth: 300 },
  track: {
    marginTop: 26,
    width: 220,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  sweep: { width: 160, height: 3 },
  footer: { position: 'absolute', bottom: 56 },
});
