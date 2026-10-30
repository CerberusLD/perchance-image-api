import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { AppText } from '@/components/AppText';
import { tap } from '@/lib/haptics';
import { colors, radius } from '@/lib/theme';

type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  emoji?: string;
  tint?: [string, string];
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function Chip({ label, active, onPress, emoji, tint, style, compact }: ChipProps) {
  const content = (
    <View style={styles.inner}>
      {!!emoji && <AppText variant="caption">{emoji}</AppText>}
      <AppText
        variant={compact ? 'caption' : 'bodyStrong'}
        color={active ? '#fff' : colors.textDim}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </View>
  );

  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        active ? styles.chipActive : styles.chipIdle,
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {active && (
        <LinearGradient
          colors={tint ?? ['#7C4DFF', '#22D3EE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.pill, opacity: 0.9 }]}
        />
      )}
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipCompact: { minHeight: 32, paddingHorizontal: 12 },
  chipIdle: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
