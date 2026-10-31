const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin: inyecta el módulo nativo del motor (DevTools/CDP) en el
 * proyecto Android generado por `expo prebuild`.
 *
 * Hace dos cosas:
 *   1. Copia las fuentes Kotlin de `native/android/` a `android/app/src/main/java/com/aether/studio/`.
 *   2. Registra el paquete en MainApplication y habilita el inspector de WebView.
 *
 * Así el motor sobrevive a cualquier `prebuild` y el APK es reproducible.
 */

const PACKAGE_PATH = ['com', 'aether', 'studio'];

function copySources(projectRoot, androidRoot) {
  const from = path.join(projectRoot, 'native', 'android');
  if (!fs.existsSync(from)) return;
  const to = path.join(androidRoot, 'app', 'src', 'main', 'java', ...PACKAGE_PATH);
  fs.mkdirSync(to, { recursive: true });
  for (const file of fs.readdirSync(from)) {
    if (!file.endsWith('.kt')) continue;
    fs.copyFileSync(path.join(from, file), path.join(to, file));
  }

  // Modelo de prompts local (ONNX + tokenizer + plantilla) dentro del APK
  const modelsFrom = path.join(projectRoot, 'assets', 'prompt_model');
  if (fs.existsSync(modelsFrom)) {
    const modelsTo = path.join(androidRoot, 'app', 'src', 'main', 'assets', 'prompt_model');
    fs.mkdirSync(modelsTo, { recursive: true });
    for (const file of fs.readdirSync(modelsFrom)) {
      fs.copyFileSync(path.join(modelsFrom, file), path.join(modelsTo, file));
    }
  }
}

module.exports = function withEngineDevtools(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = cfg.modRequest.platformProjectRoot;
      copySources(projectRoot, androidRoot);
      return cfg;
    },
  ]);

  // 3) permitir HTTP en claro (motor propio en red local por http://) y
  //    habilitar la instalación de actualizaciones descargadas por la app.
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const app = manifest.application?.[0];
    if (app && app.$) {
      app.$['android:usesCleartextTraffic'] = 'true';
      // El motor de prompts (ONNX) convive con la WebView del generador: se
      // necesita heap ampliado para no morir por memoria en gama media.
      app.$['android:largeHeap'] = 'true';

      // FileProvider para entregar el APK al instalador del sistema
      app.provider = app.provider || [];
      if (!app.provider.some((p) => p?.$?.['android:authorities']?.includes('fileprovider'))) {
        app.provider.push({
          $: {
            'android:name': 'androidx.core.content.FileProvider',
            'android:authorities': '${applicationId}.fileprovider',
            'android:exported': 'false',
            'android:grantUriPermissions': 'true',
          },
          'meta-data': [
            {
              $: {
                'android:name': 'android.support.FILE_PROVIDER_PATHS',
                'android:resource': '@xml/aether_file_paths',
              },
            },
          ],
        });
      }
    }

    manifest['uses-permission'] = manifest['uses-permission'] || [];
    const hasInstall = manifest['uses-permission'].some(
      (p) => p?.$?.['android:name'] === 'android.permission.REQUEST_INSTALL_PACKAGES',
    );
    if (!hasInstall) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.REQUEST_INSTALL_PACKAGES' },
      });
    }
    return cfg;
  });

  // 2b) ONNX Runtime para el modelo de prompts (inferencia en el dispositivo)
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('onnxruntime-android')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        'dependencies {\n    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.20.0")',
      );
    }
    return cfg;
  });

  // 3b) rutas del FileProvider (caché y files)
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'aether_file_paths.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<paths xmlns:android="http://schemas.android.com/apk/res/android">\n' +
          '  <cache-path name="cache" path="." />\n' +
          '  <files-path name="files" path="." />\n' +
          '</paths>\n',
      );
      return cfg;
    },
  ]);

  // 4) Edición ilimitada: otro applicationId para convivir con la versión gratis
  //    (el package de Java/Kotlin no cambia, así el módulo nativo sigue igual).
  if (process.env.EXPO_PUBLIC_UNLIMITED === '1') {
    config = withAppBuildGradle(config, (cfg) => {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /applicationId ['"]com\.aether\.studio['"]/,
        "applicationId 'com.aether.studio.unlimited'",
      );
      return cfg;
    });
  }

  config = withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;

    // 1) registrar el paquete nativo
    if (!src.includes('add(AetherPackage())')) {
      src = src.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        'PackageList(this).packages.apply {\n          add(AetherPackage())',
      );
    }

    // 2) habilitar el inspector de la WebView (necesario para CDP)
    if (!src.includes('setWebContentsDebuggingEnabled')) {
      src = src.replace(
        /override fun onCreate\(\)\s*\{\s*\n(\s*)super\.onCreate\(\)/,
        (match, indent) =>
          `override fun onCreate() {\n${indent}super.onCreate()\n${indent}` +
          '// Habilitado para que el motor pueda leer su propia WebView (CDP).\n' +
          `${indent}try { android.webkit.WebView.setWebContentsDebuggingEnabled(true) } catch (e: Exception) {}`,
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });

  return config;
};
