import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { ArtworkCard } from '@/components/ArtworkCard';
import { AuroraBackground } from '@/components/AuroraBackground';
import { GhostButton, IconButton, PrimaryButton } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Sheet } from '@/components/Sheet';
import { ratioById } from '@/lib/ratios';
import { saveToGallery, shareImage } from '@/lib/media';
import { styleLabel } from '@/lib/styles';
import { colors } from '@/lib/theme';
import { Artwork, useApp } from '@/store/app';

const { width: SCREEN_W } = Dimensions.get('window');
const GUTTER = 20;
const COL_GAP = 12;
/** En pantallas anchas la rejilla no crece sin límite. */
const CONTENT_W = Math.min(SCREEN_W, 620);
const COL_W = (CONTENT_W - GUTTER * 2 - COL_GAP) / 2;

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { artworks, favorites, toggleFavorite, removeArtwork, showToast } = useApp();
  const [filter, setFilter] = useState<'all' | 'fav'>('all');
  const [selected, setSelected] = useState<Artwork | null>(null);

  const list = filter === 'all' ? artworks : favorites;

  const columns = useMemo(() => {
    const cols: Artwork[][] = [[], []];
    const heights = [0, 0];
    list.forEach((art) => {
      const aspect = ratioById(art.ratio).aspect;
      const h = COL_W / aspect;
      const target = heights[0] <= heights[1] ? 0 : 1;
      cols[target].push(art);
      heights[target] += h + COL_GAP;
    });
    return cols;
  }, [list]);

  const openActions = (art: Artwork) => setSelected(art);

  return (
    <View style={styles.root}>
      <AuroraBackground />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: GUTTER,
          paddingBottom: 150,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={{ gap: 4 }}>
            <AppText variant="display" style={{ fontSize: 30 }}>
              Galería
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {artworks.length === 0
                ? 'Aún no hay nada aquí'
                : `${artworks.length} ${artworks.length === 1 ? 'creación' : 'creaciones'} · ${favorites.length} en favoritos`}
            </AppText>
          </View>
          <IconButton name="sparkles-outline" onPress={() => router.push('/')} />
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Todas" active={filter === 'all'} onPress={() => setFilter('all')} compact />
          <Chip label="Favoritos" active={filter === 'fav'} onPress={() => setFilter('fav')} compact />
        </View>

        {list.length === 0 ? (
          <EmptyState
            icon={filter === 'fav' ? 'star-outline' : 'images-outline'}
            title={filter === 'fav' ? 'Sin favoritos todavía' : 'Tu galería está vacía'}
            message={
              filter === 'fav'
                ? 'Mantén pulsada una imagen y márcala con la estrella para tenerla siempre a mano.'
                : 'Describe lo que imaginas y tu primera creación aparecerá aquí.'
            }
            action={
              filter === 'all' ? (
                <PrimaryButton label="Crear mi primera imagen" onPress={() => router.push('/')} />
              ) : undefined
            }
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: COL_GAP, alignSelf: 'center' }}>
            {columns.map((col, i) => (
              <View key={i} style={{ width: COL_W, gap: COL_GAP }}>
                {col.map((art) => (
                  <ArtworkCard
                    key={art.id}
                    artwork={art}
                    width={COL_W}
                    height={COL_W / ratioById(art.ratio).aspect}
                    onPress={() => router.push(`/image/${art.id}`)}
                    onLongPress={() => openActions(art)}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title="Acciones"
        subtitle={selected?.prompt}
        scroll={false}
      >
        {selected && (
          <View style={{ gap: 10, paddingBottom: 8 }}>
            <SheetAction
              icon={selected.favorite ? 'star' : 'star-outline'}
              label={selected.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              onPress={() => {
                toggleFavorite(selected.id);
                setSelected(null);
              }}
            />
            <SheetAction
              icon="download-outline"
              label="Guardar en el dispositivo"
              onPress={async () => {
                const res = await saveToGallery(selected.uri);
                setSelected(null);
                showToast(
                  res === 'saved' ? 'Imagen guardada' : res === 'denied' ? 'Permiso denegado' : 'No se pudo guardar',
                  res === 'saved' ? 'success' : 'error',
                );
              }}
            />
            <SheetAction
              icon="share-outline"
              label="Compartir"
              onPress={async () => {
                const ok = await shareImage(selected.uri, selected.prompt);
                setSelected(null);
                if (!ok) showToast('Compartir no está disponible', 'error');
              }}
            />
            <SheetAction
              icon="copy-outline"
              label="Copiar descripción"
              onPress={async () => {
                await Clipboard.setStringAsync(selected.prompt);
                setSelected(null);
                showToast('Descripción copiada', 'success');
              }}
            />
            <SheetAction
              icon="refresh-outline"
              label="Reutilizar en el editor"
              onPress={() => {
                const art = selected;
                setSelected(null);
                router.push({
                  pathname: '/',
                  params: {
                    prompt: art.prompt,
                    style: art.style ?? 'null',
                    ratio: art.ratio,
                    token: String(Date.now()),
                  },
                });
              }}
            />
            <SheetAction
              icon="trash-outline"
              label="Eliminar"
              tone="danger"
              onPress={() => {
                removeArtwork(selected.id);
                setSelected(null);
                showToast('Creación eliminada');
              }}
            />
          </View>
        )}
      </Sheet>
    </View>
  );
}

function SheetAction({
  icon,
  label,
  onPress,
  tone = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <GhostButton
      label={label}
      icon={icon}
      onPress={onPress}
      tone={tone}
      style={{ justifyContent: 'flex-start' }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
