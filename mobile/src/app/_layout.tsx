import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/AuroraBackground';
import { EngineProvider } from '@/components/EngineLayer';
import { BrandMark } from '@/components/BrandMark';
import { OnboardingGate } from '@/components/Onboarding';
import { ToastHost } from '@/components/ToastHost';
import { warmEngine } from '@/lib/api';
import { colors } from '@/lib/theme';
import { AppProvider } from '@/store/app';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  React.useEffect(() => {
    warmEngine();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <AuroraBackground />
        <BrandMark size={64} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <EngineProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.void },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="image/[id]"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen name="legal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
        <ToastHost />
        <OnboardingGate />
        </EngineProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.void },
});
