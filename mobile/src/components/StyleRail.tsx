import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { select as hapticSelect } from '@/lib/haptics';
import { POPULAR_STYLES, STYLE_PRESETS, StylePreset } from '@/lib/styles';
import { colors, radius } from '@/lib/theme';

type Props = {
  value: string | null;
  onChange: (style: string | null) => void;
  onOpenAll: () => void;
};

export function StyleRail({ value, onChange, onOpenAll }: Props) {
  return (
    <View>
      <View style={styles.headRow}>
        <AppText variant="label" color={colors.textMuted}>
          Estilo visual
        </AppText>
        <Pressable onPress={onOpenAll} hitSlop={10}>
          <AppText variant="caption" color={colors.accentSoft}>
            Ver todos
          </AppText>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {POPULAR_STYLES.map((id) => {
          const preset = STYLE_PRESETS.find((p) => p.id === (id ?? null));
          if (!preset) return null;
          return (
            <StyleTile
              key={preset.id ?? 'free'}
              preset={preset}
              active={value === preset.id}
              onPress={() => {
                hapticSelect();
                onChange(preset.id);
              }}
            />
          );
        })}
        <Pressable onPress={onOpenAll} style={styles.moreTile}>
          <AppText variant="caption" color={colors.textDim} align="center">
            +{STYLE_PRESETS.length - POPULAR_STYLES.length}
            {'\n'}más
          </AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export function StyleTile({
  preset,
  active,
  onPress,
}: {
  preset: StylePreset;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <LinearGradient
        colors={preset.tint}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.tile, active && styles.tileActive]}
      >
        <AppText variant="heading">{preset.emoji}</AppText>
        <AppText
          variant="micro"
          color={active ? '#fff' : colors.textDim}
          numberOfLines={1}
          style={{ marginTop: 6 }}
        >
          {preset.label}
        </AppText>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rail: { gap: 10, paddingRight: 24, paddingVertical: 2 },
  tile: {
    width: 84,
    height: 76,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 6,
  },
  tileActive: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  moreTile: {
    width: 64,
    height: 76,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHi,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
