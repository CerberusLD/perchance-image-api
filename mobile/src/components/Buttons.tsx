import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, glow, gradients, radius } from '@/lib/theme';
import { press as hapticPress } from '@/lib/haptics';

type PrimaryProps = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
};

export function PrimaryButton({
  label,
  onPress,
  icon = 'sparkles',
  loading,
  disabled,
  style,
  subtitle,
}: PrimaryProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        hapticPress();
        onPress();
      }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.wrapper,
        style,
        !inactive && glow,
        pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 },
        inactive && { opacity: 0.55 },
      ]}
    >
      <LinearGradient
        colors={['#7C4DFF', '#8B5CF6', '#22D3EE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name={icon} size={18} color="#fff" />
            <View>
              <AppText variant="bodyStrong" color="#fff" style={styles.label}>
                {label}
              </AppText>
              {!!subtitle && (
                <AppText variant="micro" color="rgba(255,255,255,0.72)">
                  {subtitle}
                </AppText>
              )}
            </View>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

type GhostProps = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'danger';
  style?: StyleProp<ViewStyle>;
};

export function GhostButton({ label, onPress, icon, tone = 'default', style }: GhostProps) {
  const tint = tone === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        hapticPress();
        onPress();
      }}
      style={({ pressed }) => [styles.ghost, style, pressed && { opacity: 0.7 }]}
    >
      {!!icon && <Ionicons name={icon} size={17} color={tint} />}
      <AppText variant="bodyStrong" color={tint}>
        {label}
      </AppText>
    </Pressable>
  );
}

type IconButtonProps = {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  color?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
  filled?: boolean;
};

export function IconButton({
  name,
  onPress,
  size = 20,
  color = colors.text,
  background = colors.surfaceHi,
  style,
  filled,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => {
        hapticPress();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: filled ? background : 'rgba(255,255,255,0.06)' },
        pressed && { opacity: 0.65, transform: [{ scale: 0.94 }] },
        style,
      ]}
      hitSlop={8}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.pill,
    overflow: 'visible',
  },
  gradient: {
    minHeight: 58,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  label: { letterSpacing: 0.2 },
  ghost: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
