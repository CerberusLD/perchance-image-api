import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors } from '@/lib/theme';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

export function ScreenHeader({ title, subtitle, right }: Props) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="display" style={{ fontSize: 30 }}>
          {title}
        </AppText>
        {!!subtitle && (
          <AppText variant="caption" color={colors.textMuted}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label" color={colors.textMuted}>
        {children}
      </AppText>
      {right}
    </View>
  );
}

export function StatusPill({
  label,
  tone = 'idle',
  icon,
}: {
  label: string;
  tone?: 'idle' | 'ok' | 'warn';
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const tint = tone === 'ok' ? colors.success : tone === 'warn' ? colors.amber : colors.textMuted;
  return (
    <View style={styles.pill}>
      {icon ? (
        <Ionicons name={icon} size={12} color={tint} />
      ) : (
        <View style={[styles.dot, { backgroundColor: tint }]} />
      )}
      <AppText variant="micro" color={colors.textDim}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
