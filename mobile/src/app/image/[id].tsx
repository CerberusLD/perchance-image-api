import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { IconButton, PrimaryButton } from '@/components/Buttons';
import { saveToGallery, shareImage } from '@/lib/media';
import { styleLabel } from '@/lib/styles';
import { colors, radius } from '@/lib/theme';
import { useApp } from '@/store/app';

const { height: SCREEN_H } = Dimensions.get('window');

export default function ImageViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { artworks, toggleFavorite, removeArtwork, showToast } = useApp();
  const [busy, setBusy] = useState(false);

  const artwork = useMemo(() => artworks.find((a) => a.id === id), [artworks, id]);

  if (!artwork) {
    return (
      <View style={[styles.root, { justifyContent: 'center' }]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Creación no encontrada"
          message="Puede que la hayas eliminado."
          action={<PrimaryButton label="Volver" onPress={() => router.back()} />}
        />
      </View>
    );
  }

  const meta = [
    styleLabel(artwork.style),
    artwork.ratio,
    new Date(artwork.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
    artwork.seed ? `semilla ${artwork.seed}` : 'semilla aleatoria',
  ];

  const onSave = async () => {
    setBusy(true);
    const res = await saveToGallery(artwork.uri);
    setBusy(false);
    showToast(
      res === 'saved' ? 'Guardada en tu dispositivo' : res === 'denied' ? 'Permiso denegado' : 'No se pudo guardar',
      res === 'saved' ? 'success' : 'error',
    );
  };

  const onShare = async () => {
    setBusy(true);
    const ok = await shareImage(artwork.uri, artwork.prompt);
    setBusy(false);
    if (!ok) showToast('Compartir no está disponible', 'error');
  };

  const onDelete = () => {
    Alert.alert('Eliminar creación', 'Esta imagen se borrará del dispositivo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          removeArtwork(artwork.id);
          router.back();
          showToast('Creación eliminada');
        },
      },
    ]);
  };

  const reuse = () => {
    router.back();
    router.push({
      pathname: '/',
      params: {
        prompt: artwork.prompt,
        style: artwork.style ?? 'null',
        ratio: artwork.ratio,
        token: String(Date.now()),
      },
    });
  };

  return (
    <View style={styles.root}>
      <Image
        source={{ uri: artwork.uri }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        transition={220}
      />

      <LinearGradient
        colors={['rgba(3,3,6,0.85)', 'transparent']}
        style={[styles.topFade, { height: insets.top + 120 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(3,3,6,0.92)', 'rgba(3,3,6,0.99)']}
        style={styles.bottomFade}
        pointerEvents="none"
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-down" onPress={() => router.back()} background="rgba(0,0,0,0.5)" />
        <View style={{ flex: 1 }} />
        <IconButton
          name={artwork.favorite ? 'star' : 'star-outline'}
          color={artwork.favorite ? '#FDE68A' : colors.text}
          onPress={() => toggleFavorite(artwork.id)}
          background="rgba(0,0,0,0.5)"
        />
        <IconButton name="trash-outline" onPress={onDelete} color={colors.danger} background="rgba(0,0,0,0.5)" />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <View style={{ gap: 10 }}>
          <AppText variant="body" color={colors.text} numberOfLines={4}>
            {artwork.prompt}
          </AppText>
          <View style={styles.metaRow}>
            {meta.map((item) => (
              <View key={item} style={styles.metaChip}>
                <AppText variant="micro" color={colors.textDim}>
                  {item}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <Action icon="download-outline" label="Guardar" onPress={onSave} disabled={busy} />
          <Action icon="share-outline" label="Compartir" onPress={onShare} disabled={busy} />
          <Action
            icon="copy-outline"
            label="Copiar"
            onPress={async () => {
              await Clipboard.setStringAsync(artwork.prompt);
              showToast('Descripción copiada', 'success');
            }}
          />
          <Action icon="refresh-outline" label="Reusar" onPress={reuse} />
        </View>
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.65 }, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.actionCircle}>
        <Ionicons name={icon} size={19} color={colors.text} />
      </View>
      <AppText variant="micro" color={colors.textDim}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#040407' },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: SCREEN_H * 0.42 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 22,
    gap: 22,
    maxWidth: 620,
    alignSelf: 'center',
    width: '100%',
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { alignItems: 'center', gap: 8, flex: 1 },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHi,
  },
});
