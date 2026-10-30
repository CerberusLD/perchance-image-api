import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/Buttons';
import { colors, radius, shadow as shadowStyle } from '@/lib/theme';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxHeightRatio?: number;
  scroll?: boolean;
};

/** Bottom sheet con blur y entrada animada. */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  maxHeightRatio = 0.86,
  scroll = true,
}: SheetProps) {
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { height } = Dimensions.get('window');

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
        mass: 0.9,
      }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  if (!mounted) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height * 0.5, 0] });

  const body = (
    <View style={{ gap: 18, paddingHorizontal: 4 }}>
      {!!title && (
        <View style={{ gap: 6 }}>
          <AppText variant="title">{title}</AppText>
          {!!subtitle && (
            <AppText variant="caption" color={colors.textDim}>
              {subtitle}
            </AppText>
          )}
        </View>
      )}
      {children}
    </View>
  );

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
            <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3,3,6,0.55)' }]} />
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: height * maxHeightRatio,
              paddingBottom: insets.bottom + 18,
              transform: [{ translateY }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(139,92,246,0.20)', 'rgba(11,11,17,0)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }} />
            <IconButton name="close" onPress={onClose} size={18} color={colors.textDim} />
          </View>
          {scroll ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8, gap: 18, paddingHorizontal: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              {body}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>{body}</View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0D0D14',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHi,
    overflow: 'hidden',
    paddingTop: 8,
    ...shadowStyle(24),
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
});
