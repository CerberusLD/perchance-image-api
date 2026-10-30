import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { AuroraBackground } from '@/components/AuroraBackground';
import { GhostButton } from '@/components/Buttons';
import { BRAND } from '@/lib/config';
import { colors, radius } from '@/lib/theme';

const SECTIONS = [
  {
    title: 'Qué guardamos',
    body: 'Aether guarda en tu dispositivo el historial de imágenes que creas, tus favoritos y tus preferencias. No creamos cuentas ni perfiles publicitarios.',
  },
  {
    title: 'Qué enviamos',
    body: 'Para generar una imagen enviamos únicamente el texto que escribes y los ajustes que eliges. No enviamos tu nombre, tu correo ni tu ubicación.',
  },
  {
    title: 'Contenido generado',
    body: 'Las imágenes se producen con modelos de inteligencia artificial. Pueden contener imprecisiones. Eres responsable del uso que hagas de ellas y de respetar los derechos de terceros.',
  },
  {
    title: 'Uso aceptable',
    body: 'No está permitido generar contenido ilegal, que sexualice a menores, que incite al odio o que vulnere derechos de otras personas.',
  },
  {
    title: 'Anuncios',
    body: 'La app es gratuita. En el futuro mostraremos anuncios para mantener el servicio; cuando eso ocurra, esta pantalla se actualizará para explicarlo con claridad.',
  },
  {
    title: 'Tus datos',
    body: 'Puedes borrar todas tus creaciones desde Ajustes → Borrar galería. Esa acción elimina los archivos del dispositivo de forma permanente.',
  },
];

export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingHorizontal: 22,
          paddingBottom: insets.bottom + 32,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.accentSoft} />
          <AppText variant="micro" color={colors.textDim}>
            Transparencia
          </AppText>
        </View>

        <AppText variant="display" style={{ fontSize: 30 }}>
          Privacidad y{'\n'}términos
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          Última actualización: {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
        </AppText>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <AppText variant="heading">{section.title}</AppText>
            <AppText variant="caption" color={colors.textDim} style={{ lineHeight: 20 }}>
              {section.body}
            </AppText>
          </View>
        ))}

        <AppText variant="micro" color={colors.textMuted} align="center">
          {BRAND.studio} · versión {BRAND.version}
        </AppText>

        <GhostButton label="Cerrar" onPress={() => router.back()} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(139,92,246,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
