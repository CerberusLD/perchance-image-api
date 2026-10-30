import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, radius } from '@/lib/theme';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon = 'sparkles-outline', title, message, action }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={26} color={colors.accentSoft} />
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText variant="caption" color={colors.textMuted} align="center" style={{ maxWidth: 280 }}>
        {message}
      </AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, paddingVertical: 56, paddingHorizontal: 24 },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,92,246,0.35)',
    marginBottom: 4,
  },
});
