# Aether — app Android de generación de imágenes

App **nativa para Android** (APK) que genera imágenes con IA desde el propio teléfono.
Tema oscuro, gratis con cuota diaria, pensada para crecer con anuncios recompensados.
**No necesita servidor**: el motor vive dentro de la app.

<p align="left">
  <a href="https://github.com/CerberusLD/perchance-image-api/releases/latest"><img alt="Descargar APK" src="https://img.shields.io/badge/Descargar-APK%20Android-8B5CF6?style=for-the-badge&logo=android&logoColor=white"></a>
</p>

---

## 1. Qué es

- **Nativa**: React Native + Expo SDK 58, compilada como APK, sin WebView visible ni navegador externo.
- **Autónoma**: una `WebView` oculta ejecuta el generador y un módulo nativo en Kotlin lee el
  resultado por DevTools (CDP). Cero backend, cero proxies.
- **Marca blanca**: ninguna pantalla, cabecera ni metadato revela de dónde salen las imágenes.
- **Freemium**: 25 creaciones al día, con el gancho de anuncio recompensado ya cableado.

## 2. Cómo funciona el motor

```
┌─────────────────────────── APK ───────────────────────────┐
│  UI (React Native)                                        │
│     │  "genera esto"                                      │
│     ▼                                                     │
│  WebView oculta  ──►  generador web  ──►  iframe (otro    │
│     ▲                                    origen) con la   │
│     │                                    imagen           │
│     │  CDP (DevTools)                     │               │
│  Módulo Kotlin  ◄─────────────────────────┘               │
│     │  data URL de la imagen                              │
│     ▼                                                     │
│  Guardado local + galería                                 │
└───────────────────────────────────────────────────────────┘
```

Por qué hace falta CDP: el generador publica la imagen en un **iframe de otro origen**.
`injectJavaScript` solo alcanza el frame principal; el módulo nativo habla el protocolo
DevTools con su propia WebView y **evalúa en cualquier frame**, igual que hace Playwright:

```
/proc/net/unix → @webview_devtools_remote_<pid>
   → GET /json/list → WebSocket /devtools/page/<id>
   → Page.getFrameTree → Page.createIsolatedWorld(frameId)
   → Runtime.evaluate  (DOM del iframe, sin importar el origen)
```

Después escribe el prompt en el campo del generador, pulsa **generate**, espera `#resultImgEl`,
convierte la imagen a *data URL* dentro del mismo frame y la guarda en el dispositivo.

Verificado en dispositivo real (Infinix X6831, Android 13): imagen generada en < 60 s,
sin servidor y sin marca de agua.

## 3. Funciones

| Módulo | Detalle |
|---|---|
| Crear | prompt multilínea (700 caracteres), 18 estilos, 6 formatos, ajustes avanzados |
| Avanzado | prompt negativo con presets, semilla fija o aleatoria |
| **Mejorar (🧠)** | reescribe la idea con el asistente del generador; si no responde en 25 s, enriquecedor local |
| Generación | overlay con etapas, contador y cancelación |
| Galería | masonry, favoritos, acciones por pulsación larga |
| Visor | pantalla completa, guardar, compartir, copiar prompt, reusar |
| Ajustes | motor propio, háptica, guardado en carrete, estado del servicio, borrado de datos |
| Cuota | 25/día con reinicio por fecha; créditos extra por anuncio (interruptor `ADS_ENABLED`) |
| Onboarding | 3 pasos, se muestra una sola vez |

## 4. Instalar en el teléfono

1. Descarga el APK desde [Releases](https://github.com/CerberusLD/perchance-image-api/releases/latest) — `Aether-1.0.0-beta.apk` (38 MB).
2. Ábrelo en el teléfono y acepta **instalar desde orígenes desconocidos** para tu gestor de archivos.
3. Requisitos: Android 7.0+ (API 24), ~110 MB libres, conexión a internet.

> El APK está firmado con clave de depuración: es una **beta** para probar, no para Play Store.

## 5. Compilar desde cero

Requisitos: Node 20+, JDK 17, Android SDK 36 (build-tools 36.0.0, NDK 27, cmake 3.22.1).

```bash
cd mobile
npm install

# generado nativo (aplica el plugin del motor, ver abajo)
npx expo prebuild --platform android --clean

cd android
./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Con el toolchain instalado en el usuario (`~/.android-toolchain`):

```bash
export JAVA_HOME="$HOME/.android-toolchain/jdk-17"
export ANDROID_HOME="$HOME/.android-toolchain/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

También puedes compilar en la nube con EAS:

```bash
npx eas-cli@latest build --platform android --profile preview
```

### El módulo nativo y `expo prebuild`

`android/` está generado y **no se versiona**. Las fuentes del motor viven en
`native/android/*.kt` y el plugin `plugins/with-engine-devtools.js` las inyecta en cada
`prebuild`: copia los Kotlin, registra `AetherPackage()` en `MainApplication` y habilita
`WebView.setWebContentsDebuggingEnabled(true)`. Si añades código nativo nuevo, edítalo en
`native/android/`, no en `android/app/src/...` (se sobrescribe).

## 6. Estructura

```
mobile/
├── app.json                     # marca, permisos, plugins
├── native/android/              # módulo del motor (Kotlin): DevtoolsClient, módulo y package
├── plugins/with-engine-devtools.js
├── scripts/make-icons.py        # iconos e identidad (Pillow)
└── src/
    ├── app/                     # rutas (expo-router)
    │   ├── _layout.tsx
    │   ├── (tabs)/{index,gallery,settings}.tsx
    │   ├── image/[id].tsx
    │   └── legal.tsx
    ├── components/              # EngineLayer (WebView+CDP), UI, hojas, overlays
    ├── lib/                     # api, config, media, storage, prompts, ratios, tema
    └── store/app.tsx            # historial, créditos, ajustes
```

## 7. Modos de motor

- **Embebido (por defecto)** — WebView + CDP dentro del APK. Recomendado.
- **Servicio propio** — Ajustes → Servicio → **Motor propio**: si pones una URL, la app usa
  HTTP `POST /generate` contra tu API (`../server.py`). Útil para depurar o para usar un
  despliegue con navegador headful. Admite `http://` en red local.

Variables de compilación opcionales (`src/lib/config.ts`):

| Variable | Uso |
|---|---|
| `EXPO_PUBLIC_API_BASE` | motor HTTP por defecto |
| `EXPO_PUBLIC_ENABLE_FALLBACK` | `true` habilita el endpoint secundario |

## 8. Mejora de prompt (🧠) y exclusión mutua

El botón **Mejorar** del campo de texto hace lo mismo que el 🧠 del generador: escribe el prompt
en su campo y pulsa `.ai-suggest-btn` por CDP, esperando a que cambie el textarea. Si no hay
respuesta en 30 s, aplica `enhancePrompt()` (local). El *toast* indica el origen.

**La WebView no puede estar oculta con tamaño 0/1 px.** Chromium la marca como `hidden` y el
generador no ejecuta el render (el clic se acepta y no pasa nada). Por eso la WebView ocupa toda la
pantalla **detrás** de la interfaz, con `opacity: 0.01` y `pointerEvents="none"`, y el motor fuerza
antes de cada operación:

```kotlin
Emulation.setDeviceMetricsOverride(360×640, mobile)
Emulation.setFocusEmulationEnabled(true)
Page.setWebLifecycleState("active")
```

Diagnóstico rápido del síntoma: `Estado: hidden` o `h=1` en `document.visibilityState` / `innerHeight`.

Claves para que el 🧠 no rompa la generación:

- generar, mejorar y diagnosticar pasan por **una sola cola** en JS y por un `synchronized` en
  Kotlin: nunca hay dos sesiones CDP a la vez;
- al terminar, `improve()` espera a que el generador vuelva a estar **libre** (el 🧠 puede
  disparar un render), y `generate()` vuelve a esperar hasta 60 s antes de pulsar;
- el clic se verifica: se comprueba que el botón quedó bloqueado o que hay estado ocupado. Si no
  reacciona, se reintenta hasta 3 veces (un clic sobre un botón deshabilitado se perdía en
  silencio y acababa en espera de 4 minutos).

## 8.1 Diagnóstico del motor

Ajustes → Servicio → **Diagnóstico del motor** devuelve el estado real del motor en el teléfono:

```
socket: webview_devtools_remote_<pid>
debugging: on
target: /devtools/page/…
frames: 3
 · https://perchance.org/ai-text-to-image-generator
 · about:blank
 · https://<hash>.perchance.org/ai-text-to-image-generator
ui: <frameId>
estado: idle
probe: ui:1
```

Si algo falla, la generación devuelve un código de etapa (`ERR:no-socket`, `ERR:no-page`,
`ERR:no-ui`, `ERR:no-result`) que la app traduce a un mensaje claro, y el módulo deja trazas
`AetherEngine` en `adb logcat -s AetherEngine`.

## 8.2 Ediciones (gratis e ilimitada)

La misma base de código produce dos APK, gobernados por `EXPO_PUBLIC_UNLIMITED`:

| Edición | Comando | Cuota | `applicationId` | Nombre |
|---|---|---|---|---|
| Gratis | `npx expo prebuild --clean` | 25/día | `com.aether.studio` | Aether |
| Ilimitada | `EXPO_PUBLIC_UNLIMITED=1 npx expo prebuild --clean` | sin límite | `com.aether.studio.unlimited` | Aether Unlimited |

El `applicationId` distinto lo aplica `plugins/with-engine-devtools.js`, así **las dos pueden estar
instaladas a la vez**; el package de Java/Kotlin no cambia. El flag se incrusta en el bundle en
tiempo de compilación (`src/lib/config.ts` → `UNLIMITED`), de modo que la edición ilimitada no
consume cuota, no muestra el bloqueo por créditos ni el gancho de anuncios.

```bash
cd mobile
EXPO_PUBLIC_UNLIMITED=1 npx expo prebuild --platform android --clean --no-install
cd android && EXPO_PUBLIC_UNLIMITED=1 ./gradlew assembleRelease
```

> Hay que exportar la variable también en el paso de Gradle: ahí se genera el bundle de JS.

## 9. Freemium y anuncios

- `FREE_DAILY_CREDITS` (25) y `REWARDED_AD_CREDITS` en `src/lib/config.ts`.
- El contador se guarda por fecha y se reinicia solo.
- `ADS_ENABLED` está en `false`: la app muestra "muy pronto" en lugar de un botón muerto.
- Para activarlos: `npx expo install react-native-google-mobile-ads`, añadir el App ID en
  `app.json`, llamar a `grantReward()` al completar el anuncio y compilar un *dev build*.

## 10. Límites y notas

- **Tiempos**: 15–60 s por imagen según red y cola del generador; espera máxima 150 s.
- **Socket CDP**: el nombre se deduce del pid (`webview_devtools_remote_<pid>`). Desde Android 10
  la app **no puede leer `/proc/net/unix`** (`EACCES`), así que no se depende de él; sólo es
  respaldo. El inspector de WebView se activa en `MainApplication.onCreate`, antes de crear
  ninguna WebView (requisito de Android).
- **Semilla**: el generador no siempre la respeta; se guarda con la imagen cuando se fija.
- **Resolución**: el generador limita el lado mayor (~768–1024 px) y conserva la proporción.
- **Cuota**: cancelar una generación consume el crédito (la petición ya salió).
- **Almacenamiento**: imágenes en `Documents/artworks`, metadatos en AsyncStorage.
- **Privacidad**: el histórico nunca sale del teléfono; "Borrar galería" elimina archivos y metadatos.

## 11. Lo que se descartó (y por qué)

Antes de llegar a CDP se probaron todas las vías "sin navegador":

| Intento | Resultado |
|---|---|
| Incrustar la página de la API (`X-Frame-Options: SAMEORIGIN`) | bloqueado por el navegador |
| Leer `#outputIframeEl` / `#console-output` desde el frame padre | otro origen / origen opaco |
| Cargar el iframe interno como documento propio | *frame-busting* → vuelve a `perchance.org` |
| `postMessage`, `localStorage`, `sessionStorage`, cookies | sin datos del resultado |
| JSONP (`format=json&callback=`) y `format=redirect` | el endpoint devuelve HTML; no redirige |
| Llamar a la API interna desde fuera del navegador | Cloudflare 403 |
| Embed a solas (`image-generation.perchance.org/embed`) | exige padre verificado: nunca acuña `userKey` |
| WebView en la nube / headless | el reto de Cloudflare no se resuelve sin ventana real |

Queda documentado para no repetir el camino.

## 12. Licencia

MIT, igual que el resto del repositorio.
