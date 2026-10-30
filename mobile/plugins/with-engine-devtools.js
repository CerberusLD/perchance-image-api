const { withAndroidManifest, withDangerousMod, withMainApplication } = require('expo/config-plugins');
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

  // 3) permitir HTTP en claro (motor propio en red local por http://)
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app && app.$) {
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });

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
