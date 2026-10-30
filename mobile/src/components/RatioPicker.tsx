import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { select as hapticSelect } from '@/lib/haptics';
import { RATIOS } from '@/lib/ratios';
import { colors, radius } from '@/lib/theme';

type Props = {
  value: string;
  onChange: (id: string) => void;
};

const BOX = 22;

export function RatioPicker({ value, onChange }: Props) {
  return (
    <View>
      <AppText variant="label" color={colors.textMuted} style={{ marginBottom: 10 }}>
        Formato
      </AppText>
      <View style={styles.row}>
        {RATIOS.map((ratio) => {
          const active = value === ratio.id;
          const w = ratio.aspect >= 1 ? BOX : BOX * ratio.aspect;
          const h = ratio.aspect >= 1 ? BOX / ratio.aspect : BOX;
          return (
            <Pressable
              key={ratio.id}
              onPress={() => {
                hapticSelect();
                onChange(ratio.id);
              }}
              style={({ pressed }) => [
                styles.cell,
                active && styles.cellActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={[styles.shape, { width: w, height: h }, active && styles.shapeActive]} />
              <AppText variant="micro" color={active ? '#fff' : colors.textMuted}>
                {ratio.id}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cellActive: {
    borderColor: 'rgba(139,92,246,0.75)',
    backgroundColor: 'rgba(139,92,246,0.14)',
  },
  shape: {
    borderWidth: 1.4,
    borderColor: colors.textMuted,
    borderRadius: 3,
  },
  shapeActive: { borderColor: colors.text, backgroundColor: 'rgba(255,255,255,0.14)' },
});
