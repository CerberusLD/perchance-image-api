import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, radius } from '@/lib/theme';
import type { Artwork } from '@/store/app';

type Props = {
  artwork: Artwork;
  width: number;
  height: number;
  onPress?: () => void;
  onLongPress?: () => void;
  showCaption?: boolean;
};

export function ArtworkCard({ artwork, width, height, onPress, onLongPress, showCaption = true }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      style={({ pressed }) => [
        styles.card,
        { width, height },
        pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
      ]}
    >
      <Image
        source={{ uri: artwork.uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={260}
        cachePolicy="memory-disk"
        recyclingKey={artwork.id}
        placeholderContentFit="cover"
      />
      <LinearGradient
        colors={['rgba(7,7,11,0)', 'rgba(7,7,11,0.55)', 'rgba(7,7,11,0.92)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0.35 }}
        end={{ x: 0.5, y: 1 }}
      />
      {artwork.favorite && (
        <View style={styles.favBadge}>
          <Ionicons name="star" size={11} color="#FDE68A" />
        </View>
      )}
      {showCaption && (
        <View style={styles.caption}>
          <AppText variant="micro" color="rgba(245,245,248,0.92)" numberOfLines={2}>
            {artwork.prompt}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  caption: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  favBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(7,7,11,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(253,230,138,0.4)',
  },
});
