import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { AuroraBackground } from '@/components/AuroraBackground';
import { GhostButton, IconButton } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { RatioPicker } from '@/components/RatioPicker';
import { SectionLabel, StatusPill } from '@/components/ScreenHeader';
import { Sheet } from '@/components/Sheet';
import { StylePickerSheet } from '@/components/StylePickerSheet';
import { checkEngine, EngineStatus } from '@/lib/api';
import { ADS_ENABLED, BRAND, FREE_DAILY_CREDITS, REWARDED_AD_CREDITS } from '@/lib/config';
import { RATIOS } from '@/lib/ratios';
import { styleLabel } from '@/lib/styles';
import { colors, radius } from '@/lib/theme';
import { useApp } from '@/store/app';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    settings,
    updateSettings,
    artworks,
    creditsLeft,
    creditsTotal,
    clearLibrary,
    grantReward,
    showToast,
  } = useApp();
  const [showStyles, setShowStyles] = useState(false);
  const [showRatio, setShowRatio] = useState(false);
  const [showEngine, setShowEngine] = useState(false);
  const [engineDraft, setEngineDraft] = useState(settings.engineUrl ?? '');
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const version = Constants.expoConfig?.version ?? BRAND.version;

  const confirmClear = () => {
    Alert.alert(
      'Borrar galería',
      'Se eliminarán todas las creaciones guardadas en este dispositivo. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar todo',
          style: 'destructive',
          onPress: () => {
            clearLibrary();
            showToast('Galería borrada');
          },
        },
      ],
    );
  };

  const runCheck = async () => {
    setChecking(true);
    const status = await checkEngine();
    setEngine(status);
    setChecking(false);
    showToast(
      status === 'ready' ? 'Servicio operativo' : status === 'waking' ? 'El servicio está arrancando' : 'No hay conexión',
      status === 'ready' ? 'success' : 'error',
    );
  };

  return (
    <View style={styles.root}>
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 20,
          paddingBottom: 150,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <AppText variant="display" style={{ fontSize: 30 }}>
            Ajustes
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            Personaliza cómo creas
          </AppText>
        </View>

        {/* Créditos */}
        <View style={styles.creditCard}>
          <LinearGradient
            colors={['rgba(139,92,246,0.22)', 'rgba(34,211,238,0.06)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={styles.boltCircle}>
              <Ionicons name="flash" size={20} color={colors.amber} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <AppText variant="heading">{creditsLeft} creaciones hoy</AppText>
              <AppText variant="micro" color={colors.textDim}>
                Plan gratis · {creditsTotal} al día · se renuevan a medianoche
              </AppText>
            </View>
          </View>
          <View style={styles.track}>
            <LinearGradient
              colors={['#8B5CF6', '#22D3EE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                height: 6,
                borderRadius: 3,
                width: `${Math.max(4, (creditsLeft / Math.max(1, creditsTotal)) * 100)}%`,
              }}
            />
          </View>
          <GhostButton
            label={ADS_ENABLED ? `Ver anuncio (+${REWARDED_AD_CREDITS})` : 'Conseguir más creaciones'}
            icon="add-circle-outline"
            onPress={() => {
              if (ADS_ENABLED) {
                grantReward();
                showToast(`+${REWARDED_AD_CREDITS} creaciones añadidas`, 'success');
              } else {
                showToast('Muy pronto: más creaciones viendo un anuncio corto');
              }
            }}
          />
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Preferencias</SectionLabel>
          <View style={styles.group}>
            <Row
              icon="pulse-outline"
              label="Vibración al tocar"
              hint="Pequeños impulsos hápticos"
              right={
                <Switch
                  value={settings.haptics}
                  onValueChange={(v) => updateSettings({ haptics: v })}
                  trackColor={{ false: 'rgba(255,255,255,0.14)', true: 'rgba(139,92,246,0.7)' }}
                  thumbColor="#fff"
                />
              }
            />
            <Divider />
            <Row
              icon="save-outline"
              label="Guardar en el carrete"
              hint="Copia cada imagen nueva en tu galería"
              right={
                <Switch
                  value={settings.saveToGallery}
                  onValueChange={(v) => updateSettings({ saveToGallery: v })}
                  trackColor={{ false: 'rgba(255,255,255,0.14)', true: 'rgba(139,92,246,0.7)' }}
                  thumbColor="#fff"
                />
              }
            />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Generación</SectionLabel>
          <View style={styles.group}>
            <Row
              icon="color-palette-outline"
              label="Estilo por defecto"
              value={styleLabel(settings.defaultStyle)}
              onPress={() => setShowStyles(true)}
            />
            <Divider />
            <Row
              icon="scan-outline"
              label="Formato por defecto"
              value={settings.defaultRatio}
              onPress={() => setShowRatio(true)}
            />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Servicio</SectionLabel>
          <View style={styles.group}>
            <Row
              icon="cloud-done-outline"
              label="Estado del servicio"
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <StatusPill
                    label={
                      engine === null
                        ? 'Sin comprobar'
                        : engine === 'ready'
                          ? 'Operativo'
                          : engine === 'waking'
                            ? 'Arrancando'
                            : 'Sin conexión'
                    }
                    tone={engine === 'ready' ? 'ok' : engine === 'waking' ? 'warn' : 'idle'}
                  />
                  <IconButton name="refresh" size={16} onPress={runCheck} color={checking ? colors.textMuted : colors.text} />
                </View>
              }
            />
            <Divider />
            <Row
              icon="server-outline"
              label="Motor propio"
              value={settings.engineUrl ? 'Personalizado' : 'Automático'}
              hint="Apunta la app a tu propio servicio de generación"
              onPress={() => {
                setEngineDraft(settings.engineUrl ?? '');
                setShowEngine(true);
              }}
            />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Datos</SectionLabel>
          <View style={styles.group}>
            <Row
              icon="trash-outline"
              label="Borrar galería"
              value={`${artworks.length}`}
              onPress={confirmClear}
              danger
            />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Acerca de</SectionLabel>
          <View style={styles.group}>
            <Row icon="shield-checkmark-outline" label="Privacidad y términos" onPress={() => router.push('/legal')} />
            <Divider />
            <Row icon="information-circle-outline" label="Versión" value={version} />
            <Divider />
            <Pressable
              onPress={() => showToast(`Plan gratis: ${FREE_DAILY_CREDITS} imágenes al día`)}
              style={styles.brandRow}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{BRAND.studio}</AppText>
                <AppText variant="micro" color={colors.textMuted}>
                  {BRAND.tagline}
                </AppText>
              </View>
              <Chip label="v1" compact />
            </Pressable>
          </View>
        </View>

        <AppText variant="micro" color={colors.textMuted} align="center">
          Todas las imágenes se generan con IA. Úsalas de forma responsable.
        </AppText>
      </ScrollView>

      <StylePickerSheet
        visible={showStyles}
        value={settings.defaultStyle}
        onChange={(v) => updateSettings({ defaultStyle: v })}
        onClose={() => setShowStyles(false)}
      />

      <Sheet
        visible={showEngine}
        onClose={() => setShowEngine(false)}
        title="Motor propio"
        subtitle="Dirección del servicio de generación. Déjalo vacío para usar el de la app."
      >
        <TextInput
          value={engineDraft}
          onChangeText={setEngineDraft}
          placeholder="http://192.168.1.50:8000"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          selectionColor={colors.accentSoft}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GhostButton
            label="Guardar"
            icon="checkmark"
            style={{ flex: 1 }}
            onPress={() => {
              updateSettings({ engineUrl: engineDraft.trim() ? engineDraft.trim() : null });
              setShowEngine(false);
              showToast('Motor actualizado', 'success');
            }}
          />
          <GhostButton
            label="Restablecer"
            onPress={() => {
              updateSettings({ engineUrl: null });
              setEngineDraft('');
              setShowEngine(false);
              showToast('Motor restablecido');
            }}
          />
        </View>
        <AppText variant="micro" color={colors.textMuted}>
          Sin barra final. Ejemplo en tu red local: http://192.168.1.50:8000
        </AppText>
      </Sheet>

      <Sheet visible={showRatio} onClose={() => setShowRatio(false)} title="Formato por defecto">
        <RatioPicker
          value={settings.defaultRatio}
          onChange={(id) => {
            updateSettings({ defaultRatio: id });
            setShowRatio(false);
          }}
        />
        <AppText variant="micro" color={colors.textMuted}>
          {RATIOS.map((r) => r.label).join(' · ')}
        </AppText>
      </Sheet>
    </View>
  );
}

function Row({
  icon,
  label,
  hint,
  value,
  right,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !right}
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.7 }]}
    >
      <View style={[styles.iconBox, danger && { backgroundColor: 'rgba(248,113,113,0.10)' }]}>
        <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.textDim} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" color={danger ? colors.danger : colors.text}>
          {label}
        </AppText>
        {!!hint && (
          <AppText variant="micro" color={colors.textMuted}>
            {hint}
          </AppText>
        )}
      </View>
      {value !== undefined && (
        <AppText variant="caption" color={colors.textMuted}>
          {value}
        </AppText>
      )}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null)}
    </Pressable>
  );
}

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  creditCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,92,246,0.35)',
    padding: 18,
    gap: 14,
    overflow: 'hidden',
  },
  boltCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  group: {
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 58,
  },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.text,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
});
