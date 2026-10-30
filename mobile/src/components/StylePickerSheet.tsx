import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Sheet } from '@/components/Sheet';
import { select as hapticSelect } from '@/lib/haptics';
import { STYLE_PRESETS } from '@/lib/styles';
import { colors, radius } from '@/lib/theme';

type Props = {
  visible: boolean;
  value: string | null;
  onChange: (style: string | null) => void;
  onClose: () => void;
};

export function StylePickerSheet({ visible, value, onChange, onClose }: Props) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Estilo visual"
      subtitle="Define la textura, la luz y el acabado de tu imagen."
    >
      <View style={styles.grid}>
        {STYLE_PRESETS.map((preset) => {
          const active = value === preset.id;
          return (
            <Pressable
              key={preset.id ?? 'free'}
              onPress={() => {
                hapticSelect();
                onChange(preset.id);
                onClose();
              }}
              style={styles.cell}
            >
              <LinearGradient
                colors={preset.tint}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.card, active && styles.cardActive]}
              >
                <AppText variant="title" style={{ fontSize: 20 }}>
                  {preset.emoji}
                </AppText>
                <AppText variant="bodyStrong" color={active ? '#fff' : colors.text} numberOfLines={1}>
                  {preset.label}
                </AppText>
                <AppText variant="micro" color="rgba(167,167,184,0.85)" numberOfLines={2}>
                  {preset.hint}
                </AppText>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
  cell: { width: '31.5%', flexGrow: 1 },
  card: {
    minHeight: 104,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  cardActive: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
});
