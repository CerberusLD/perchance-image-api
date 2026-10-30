import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { ArtworkCard } from '@/components/ArtworkCard';
import { AuroraBackground } from '@/components/AuroraBackground';
import { BrandMark } from '@/components/BrandMark';
import { GhostButton, IconButton, PrimaryButton } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { useEngine } from '@/components/EngineLayer';
import { ProgressOverlay } from '@/components/ProgressOverlay';
import { RatioPicker } from '@/components/RatioPicker';
import { SectionLabel, StatusPill } from '@/components/ScreenHeader';
import { Sheet } from '@/components/Sheet';
import { StylePickerSheet } from '@/components/StylePickerSheet';
import { StyleRail } from '@/components/StyleRail';
import { ApiError, ApiErrorKind, checkEngine, downloadToFile, EngineStatus, engineErrorMessage, friendlyError, generateImage, saveDataUrl } from '@/lib/api';
import { ADS_ENABLED, FREE_DAILY_CREDITS, REWARDED_AD_CREDITS } from '@/lib/config';
import { success as hapticSuccess, warn as hapticWarn } from '@/lib/haptics';
import { NEGATIVE_PRESETS, PROMPT_IDEAS, PROMPT_TAGS, randomIdeas } from '@/lib/prompts';
import { RATIOS, ratioById } from '@/lib/ratios';
import { saveToGallery } from '@/lib/media';
import { STYLE_PRESETS, styleLabel, withStyle } from '@/lib/styles';
import { colors, radius } from '@/lib/theme';
import { useApp } from '@/store/app';

const MAX_PROMPT = 700;

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string; style?: string; ratio?: string; token?: string }>();
  const { settings, artworks, creditsLeft, creditsTotal, consumeCredit, addArtwork, showToast } = useApp();
  const embedded = useEngine();

  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [style, setStyle] = useState<string | null>(settings.defaultStyle);
  const [ratio, setRatio] = useState(settings.defaultRatio);
  const [seed, setSeed] = useState('');
  const [showStyles, setShowStyles] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [engine, setEngine] = useState<EngineStatus>('waking');
  const [focused, setFocused] = useState(false);
  const [improving, setImproving] = useState(false);
  const appliedToken = useRef<string | null>(null);

  useEffect(() => {
    if (settings.engineUrl) {
      checkEngine().then(setEngine);
    }
  }, [settings.engineUrl]);

  // Reutilizar prompt enviado desde el visor
  useEffect(() => {
    if (!params.prompt || appliedToken.current === params.token) return;
    appliedToken.current = params.token ?? params.prompt;
    setPrompt(params.prompt);
    if (params.style) setStyle(params.style === 'null' ? null : params.style);
    if (params.ratio) setRatio(params.ratio);
  }, [params.prompt, params.style, params.ratio, params.token]);

  const recent = useMemo(() => artworks.slice(0, 4), [artworks]);
  const canGenerate = prompt.trim().length >= 3 && !generating;

  const handleImprove = useCallback(async () => {
    const clean = prompt.trim();
    if (clean.length < 3) {
      hapticWarn();
      showToast('Escribe una idea y la mejoro', 'error');
      return;
    }
    setImproving(true);
    try {
      const better = await embedded.improve(clean);
      if (better) {
        setPrompt(better.text.slice(0, MAX_PROMPT));
        hapticSuccess();
        showToast(
          better.source === 'engine' ? 'Idea mejorada por el generador' : 'Idea mejorada',
          'success',
        );
      } else {
        showToast('No se pudo mejorar ahora mismo', 'error');
      }
    } finally {
      setImproving(false);
    }
  }, [prompt, embedded, showToast]);

  const handleGenerate = useCallback(async () => {
    const clean = prompt.trim();
    if (clean.length < 3) {
      hapticWarn();
      showToast('Describe un poco más tu idea', 'error');
      return;
    }
    if (creditsLeft <= 0) {
      setShowCredits(true);
      return;
    }
    if (!consumeCredit()) {
      setShowCredits(true);
      return;
    }

    setGenerating(true);
    try {
      const parsedSeed = seed.trim() ? Number.parseInt(seed.trim(), 10) : -1;
      const resolution = ratioById(ratio).resolution;

      // Dos modos: motor propio por HTTP (si está configurado) o motor embebido
      // en la WebView invisible (sin servidor).
      let result: { uri: string; durationMs: number };
      if (settings.engineUrl) {
        result = await generateImage({
          prompt: clean,
          negativePrompt: negative.trim(),
          style,
          resolution,
          seed: Number.isFinite(parsedSeed) ? parsedSeed : -1,
        });
      } else {
        const started = Date.now();
        const engineResult = await embedded.generate({
          prompt: withStyle(clean, style),
          negativePrompt: negative.trim(),
          resolution,
          seed: Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : undefined,
        });
        if (!engineResult.ok) {
          const kind: ApiErrorKind =
            engineResult.error === 'busy' ? 'busy' : engineResult.error === 'no-result' ? 'timeout' : 'server';
          throw new ApiError(kind, engineErrorMessage(engineResult.error));
        }
        const downloaded = engineResult.dataUrl
          ? await saveDataUrl(engineResult.dataUrl)
          : await downloadToFile(engineResult.url);
        result = { uri: downloaded.uri, durationMs: Date.now() - started };
      }

      const artwork = addArtwork({
        uri: result.uri,
        prompt: clean,
        negativePrompt: negative.trim(),
        style,
        ratio,
        width: 768,
        height: 768,
        seed: Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : null,
        durationMs: result.durationMs,
      });

      if (settings.saveToGallery) {
        const saved = await saveToGallery(result.uri);
        if (saved === 'denied') showToast('Permiso de galería denegado', 'error');
      }

      hapticSuccess();
      setGenerating(false);
      router.push(`/image/${artwork.id}`);
    } catch (err) {
      setGenerating(false);
      const kind = err instanceof ApiError ? err.kind : 'unknown';
      showToast(friendlyError(kind), 'error');
      if (kind === 'network') setEngine('unreachable');
    }
  }, [
    prompt, creditsLeft, consumeCredit, seed, negative, style, ratio, addArtwork, settings.saveToGallery,
    router, showToast,
  ]);

  const surprise = () => {
    const idea = randomIdeas(1)[0];
    const preset = STYLE_PRESETS[1 + Math.floor(Math.random() * (STYLE_PRESETS.length - 1))];
    setPrompt(idea.text);
    setStyle(preset.id);
    setRatio(RATIOS[Math.floor(Math.random() * RATIOS.length)].id);
  };

  const embeddedReady = embedded.ready || generating;
  const engineTone = settings.engineUrl
    ? engine === 'ready' ? 'ok' : engine === 'waking' ? 'warn' : 'idle'
    : embeddedReady ? 'ok' : 'warn';
  const engineLabel = settings.engineUrl
    ? engine === 'ready' ? 'Motor listo' : engine === 'waking' ? 'Despertando' : 'Sin conexión'
    : generating ? embedded.status : embeddedReady ? 'Motor listo' : 'Preparando motor';

  return (
    <View style={styles.root}>
      <AuroraBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 10,
            paddingHorizontal: 20,
            paddingBottom: 160,
            gap: 16,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <BrandMark size={32} />
              <View>
                <AppText variant="heading" style={{ letterSpacing: 0.2 }}>
                  Aether
                </AppText>
                <AppText variant="micro" color={colors.textMuted}>
                  Estudio de imagen
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {engine !== 'ready' && <StatusPill label={engineLabel} tone={engineTone} />}
              <Pressable onPress={() => setShowCredits(true)} style={styles.creditPill}>
                <Ionicons name="flash" size={13} color={colors.amber} />
                <AppText variant="micro" color={colors.textDim}>
                  {Number.isFinite(creditsLeft) ? `${creditsLeft} hoy` : 'Ilimitado'}
                </AppText>
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <AppText variant="display" style={{ fontSize: 31, lineHeight: 37 }}>
              Convierte una idea{'\n'}en una
              <AppText variant="display" color={colors.accentSoft} style={{ fontSize: 31, lineHeight: 37 }}> imagen</AppText>
            </AppText>
            <AppText variant="caption" color={colors.textMuted} style={{ maxWidth: 320 }}>
              Escribe lo que quieres ver. Cuanto más concreto, mejor el resultado.
            </AppText>
          </View>

          <View style={[styles.promptCard, focused && styles.promptCardFocused]}>
            <View style={styles.promptHead}>
              <AppText variant="label" color={colors.textMuted}>
                Tu idea
              </AppText>
              <AppText variant="micro" color={prompt.length > MAX_PROMPT * 0.9 ? colors.amber : colors.textMuted}>
                {prompt.length}/{MAX_PROMPT}
              </AppText>
            </View>
            <TextInput
              value={prompt}
              onChangeText={(t) => setPrompt(t.slice(0, MAX_PROMPT))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Una bailarina hecha de polvo dorado, congelada en el aire, fondo negro…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.input}
              selectionColor={colors.accentSoft}
              maxLength={MAX_PROMPT}
            />
            <View style={styles.promptActions}>
              <Pressable
                style={[styles.improveAction, improving && { opacity: 0.7 }]}
                onPress={handleImprove}
                disabled={improving || generating}
              >
                {improving ? (
                  <ActivityIndicator size="small" color={colors.accentSoft} />
                ) : (
                  <AppText variant="caption">🧠</AppText>
                )}
                <AppText variant="micro" color={colors.accentSoft}>
                  {improving ? 'Mejorando…' : 'Mejorar'}
                </AppText>
              </Pressable>
              <Pressable style={styles.miniAction} onPress={surprise}>
                <Ionicons name="dice-outline" size={15} color={colors.accentSoft} />
                <AppText variant="micro" color={colors.textDim}>
                  Sorpréndeme
                </AppText>
              </Pressable>
              <Pressable style={styles.miniAction} onPress={() => setShowIdeas(true)}>
                <Ionicons name="bulb-outline" size={15} color={colors.textDim} />
                <AppText variant="micro" color={colors.textDim}>
                  Ideas
                </AppText>
              </Pressable>
              {prompt.length > 0 && (
                <Pressable style={styles.miniAction} onPress={() => setPrompt('')}>
                  <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} />
                  <AppText variant="micro" color={colors.textMuted}>
                    Limpiar
                  </AppText>
                </Pressable>
              )}
            </View>
          </View>

          <StyleRail value={style} onChange={setStyle} onOpenAll={() => setShowStyles(true)} />

          <RatioPicker value={ratio} onChange={setRatio} />

          <Pressable style={styles.advancedRow} onPress={() => setShowAdvanced((v) => !v)}>
            <View style={styles.advancedLeft}>
              <Ionicons name="color-filter-outline" size={16} color={colors.textDim} />
              <AppText variant="bodyStrong" color={colors.textDim}>
                Ajustes avanzados
              </AppText>
              {(negative.length > 0 || seed.length > 0) && (
                <View style={styles.dotActive}>
                  <AppText variant="micro" color="#fff">
                    {[negative && 'neg', seed && 'seed'].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
              )}
            </View>
            <Ionicons
              name={showAdvanced ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textMuted}
            />
          </Pressable>

          {showAdvanced && (
            <View style={styles.advancedBox}>
              <View style={{ gap: 8 }}>
                <AppText variant="label" color={colors.textMuted}>
                  Evitar
                </AppText>
                <TextInput
                  value={negative}
                  onChangeText={setNegative}
                  placeholder="blurry, text, deformed…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.smallInput}
                  selectionColor={colors.accentSoft}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {NEGATIVE_PRESETS.map((preset) => (
                    <Chip
                      key={preset}
                      compact
                      label={preset.split(',')[0]}
                      onPress={() => setNegative(preset)}
                    />
                  ))}
                </ScrollView>
              </View>
              <View style={{ gap: 8, marginTop: 14 }}>
                <AppText variant="label" color={colors.textMuted}>
                  Semilla (opcional)
                </AppText>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput
                    value={seed}
                    onChangeText={(t) => setSeed(t.replace(/[^0-9]/g, '').slice(0, 9))}
                    placeholder="Aleatoria"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    style={[styles.smallInput, { flex: 1 }]}
                    selectionColor={colors.accentSoft}
                  />
                  <IconButton
                    name="shuffle"
                    onPress={() => setSeed(String(Math.floor(Math.random() * 999_999_999)))}
                  />
                </View>
                <AppText variant="micro" color={colors.textMuted}>
                  Con la misma semilla y el mismo texto obtienes composiciones muy parecidas.
                </AppText>
              </View>
            </View>
          )}

          <View style={{ gap: 12 }}>
            <PrimaryButton
              label={generating ? 'Creando…' : canGenerate ? 'Generar imagen' : 'Escribe tu idea'}
              icon={generating ? 'hourglass-outline' : 'sparkles'}
              onPress={handleGenerate}
              loading={generating}
              disabled={!canGenerate}
              subtitle={creditsLeft > 0 ? `${creditsLeft} creaciones disponibles hoy` : 'Sin creaciones disponibles'}
            />
            <AppText variant="micro" color={colors.textMuted} align="center">
              {styleLabel(style)} · {ratio} · {ratioById(ratio).label}
            </AppText>
          </View>

          {recent.length > 0 && (
            <View style={{ gap: 12 }}>
              <SectionLabel
                right={
                  <Pressable onPress={() => router.push('/gallery')} hitSlop={8}>
                    <AppText variant="caption" color={colors.accentSoft}>
                      Ver galería
                    </AppText>
                  </Pressable>
                }
              >
                Recientes
              </SectionLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {recent.map((art) => (
                  <ArtworkCard
                    key={art.id}
                    artwork={art}
                    width={132}
                    height={168}
                    onPress={() => router.push(`/image/${art.id}`)}
                    showCaption={false}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          <AppText variant="micro" color={colors.textMuted} align="center" style={{ marginTop: 6 }}>
            Las imágenes se generan con inteligencia artificial y se guardan solo en este dispositivo.
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>

      <ProgressOverlay
        visible={generating}
        prompt={prompt.trim()}
        onCancel={() => {
          setGenerating(false);
          showToast('Generación cancelada');
        }}
      />

      <StylePickerSheet
        visible={showStyles}
        value={style}
        onChange={setStyle}
        onClose={() => setShowStyles(false)}
      />

      <Sheet
        visible={showIdeas}
        onClose={() => setShowIdeas(false)}
        title="Ideas para empezar"
        subtitle="Toca una y edítala a tu gusto."
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PROMPT_TAGS.map((tag) => (
            <Chip key={tag} compact label={tag} />
          ))}
        </ScrollView>
        <View style={{ gap: 10 }}>
          {PROMPT_IDEAS.slice(0, 18).map((idea) => (
            <Pressable
              key={idea.text}
              onPress={() => {
                setPrompt(idea.text);
                setShowIdeas(false);
              }}
              style={styles.ideaRow}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="micro" color={colors.accentSoft}>
                  {idea.tag}
                </AppText>
                <AppText variant="caption" color={colors.textDim} numberOfLines={2}>
                  {idea.text}
                </AppText>
              </View>
              <Ionicons name="arrow-up-outline" size={16} color={colors.textMuted} style={{ transform: [{ rotate: '45deg' }] }} />
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={showCredits}
        onClose={() => setShowCredits(false)}
        title="Tus creaciones"
        subtitle={
          Number.isFinite(FREE_DAILY_CREDITS)
            ? `Cada día tienes ${FREE_DAILY_CREDITS} imágenes gratis. Se renuevan a medianoche.`
            : 'Esta edición genera imágenes sin límite, sin anuncios y sin esperas.'
        }
      >
        <View style={styles.creditCard}>
          <View style={{ flex: 1, gap: 6 }}>
            <AppText variant="title" style={{ fontSize: 30 }}>
              {Number.isFinite(creditsLeft) ? creditsLeft : '∞'}
            </AppText>
            <AppText variant="caption" color={colors.textDim}>
              {Number.isFinite(creditsLeft) ? `disponibles hoy de ${creditsTotal}` : 'generaciones ilimitadas'}
            </AppText>
          </View>
          <Ionicons name="flash" size={34} color={colors.amber} />
        </View>
        <View style={styles.trackBar}>
          <LinearGradient
            colors={['#8B5CF6', '#22D3EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              height: 8,
              borderRadius: 4,
              width: `${
                Number.isFinite(creditsLeft) ? Math.max(4, (creditsLeft / Math.max(1, creditsTotal)) * 100) : 100
              }%`,
            }}
          />
        </View>
        {Number.isFinite(creditsLeft) && (
          <GHostWrap
            text={
              ADS_ENABLED
                ? `Mira un anuncio corto y suma ${REWARDED_AD_CREDITS} creaciones más.`
                : 'Muy pronto podrás sumar más creaciones viendo un anuncio corto.'
            }
          />
        )}
        <GhostButton label="Entendido" onPress={() => setShowCredits(false)} />
      </Sheet>
    </View>
  );
}

function GHostWrap({ text }: { text: string }) {
  return (
    <View style={styles.infoBox}>
      <Ionicons name="information-circle-outline" size={18} color={colors.accentSoft} />
      <AppText variant="caption" color={colors.textDim} style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  creditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  promptCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.035)',
    padding: 16,
    gap: 10,
  },
  promptCardFocused: {
    borderColor: 'rgba(139,92,246,0.55)',
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  promptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 23,
    color: colors.text,
    minHeight: 82,
    textAlignVertical: 'top',
    padding: 0,
  },
  promptActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  miniAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  improveAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(139,92,246,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,92,246,0.4)',
  },
  advancedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  advancedLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dotActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  advancedBox: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 16,
  },
  smallInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.text,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  ideaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  creditCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  trackBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,92,246,0.25)',
  },
});
