#!/usr/bin/env bash
# Instala Aether en el teléfono conectado y la abre.
set -euo pipefail

SDK="$HOME/.android-toolchain/android-sdk"
export PATH="$SDK/platform-tools:$PATH"
APK="${1:-/media/kevin/DISCODATOSHDD/Proyectos/ImageGenerator Servidor/mobile/android/app/build/outputs/apk/release/app-release.apk}"

echo "== dispositivo =="
adb devices | tail -n +2
adb shell getprop ro.product.model

echo "== instalando =="
adb install -r "$APK"

# Permite que el móvil llegue al motor local por USB (127.0.0.1:8004 en el teléfono)
adb reverse tcp:8004 tcp:8004 || echo "(adb reverse no disponible)"

echo "== abriendo =="
adb shell am start -n com.aether.studio/.MainActivity

sleep 6
echo "== captura =="
adb exec-out screencap -p > /tmp/aether_screen.png
ls -lh /tmp/aether_screen.png
