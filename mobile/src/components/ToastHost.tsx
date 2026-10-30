import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useApp } from '@/store/app';
import { colors, radius, shadow } from '@/lib/theme';

/** Aviso flotante discreto, sobre la barra de pestañas. */
export function ToastHost() {
  const { toast } = useApp();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: toast ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [toast, anim]);

  if (!toast) return null;

  const tint =
    toast.tone === 'success' ? colors.success : toast.tone === 'error' ? colors.danger : colors.accentSoft;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <View style={styles.toast}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <AppText variant="caption" style={{ flex: 1 }} numberOfLines={2}>
          {toast.message}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 104,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(20,20,28,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHi,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    maxWidth: 460,
    ...shadow(10),
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
