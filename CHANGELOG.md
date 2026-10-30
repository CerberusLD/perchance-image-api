# Changelog

## v1.0.0-unlimited — Aether Unlimited (Android)

Edición sin cuota, construida desde el mismo código con `EXPO_PUBLIC_UNLIMITED=1`.

### Añadido

- **Generaciones infinitas**: no hay contador diario ni bloqueo por créditos (`FREE_DAILY_CREDITS`
  pasa a infinito y `consumeCredit()` no descuenta).
- Interfaz adaptada: la píldora de la cabecera, la hoja de créditos y el bloque de plan muestran
  "Ilimitado" / "Generaciones ilimitadas" en lugar de cifras, y se oculta el gancho de anuncios.
- Identidad propia: `Aether Unlimited`, `applicationId com.aether.studio.unlimited`, esquema
  `aetherunlimited`, para poder convivir instalada con la versión gratis.
- `app.config.js` que elige la variante según `EXPO_PUBLIC_UNLIMITED`.

## v1.0.0-beta — Aether para Android

Primera versión pública de la app.

### Añadido

- **App Android nativa** (`mobile/`): Expo SDK 58 + React Native + Expo Router + TypeScript.
- **Motor embebido sin servidor**: WebView oculta + módulo nativo Kotlin que habla DevTools (CDP)
  con su propia WebView para leer el resultado del generador, aunque esté en un iframe de otro origen.
- **Mejora de prompt (🧠)**: usa el asistente del generador vía CDP; si no responde en 25 s,
  aplica un enriquecedor local.
- Pantalla de creación con 18 estilos, 6 formatos, prompt negativo y semilla.
- Galería tipo masonry con favoritos, acciones y borrado.
- Visor a pantalla completa: guardar, compartir, copiar prompt, reusar.
- Ajustes: motor propio (HTTP), háptica, guardado en carrete, estado del servicio, borrado de datos.
- Cuota freemium de 25 imágenes diarias con gancho de anuncio recompensado (`ADS_ENABLED`).
- Onboarding de 3 pasos e identidad visual generada por script (`scripts/make-icons.py`).
- **Config plugin** (`plugins/with-engine-devtools.js`) que inyecta el módulo nativo en cada
  `expo prebuild`, para que el APK sea reproducible.
- `infra/`: proxy neutro para Cloudflare Workers (reenvío o generación con Workers AI).
- API en Python: motor Camoufox con `HEADLESS` configurable y `xvfb-run` en Docker.

### Corregido

- **Timeout al generar en la app** — causa principal: **la WebView oculta medía 1×1 px**.
  Chromium la marcaba como `visibilityState: "hidden"` con un viewport de 1 px de alto, y el
  generador no ejecuta el render en esas condiciones: el clic se aceptaba pero no producía nada.
  Ahora la WebView ocupa la pantalla **detrás** de la interfaz (opaca para el usuario, con layout
  real) y el motor fuerza por CDP `Emulation.setDeviceMetricsOverride(360×640)`,
  `Emulation.setFocusEmulationEnabled` y `Page.setWebLifecycleState("active")` antes de interactuar.
  Verificado en el teléfono: `visibilityState` pasó de `hidden` a `visible` y la misma pulsación
  generó la imagen en **27,2 s**.

  Causas secundarias, también corregidas:
  1. el motor elegía el primer frame con `textarea` (la página externa, con campos ocultos) en vez
     del frame real del generador;
  2. el árbol de frames se leía con una regex que exigía `id → loaderId → url`, pero los frames
     hijos añaden `parentId` en medio, así que **solo se veía el frame raíz**;
  3. el socket DevTools se buscaba leyendo `/proc/net/unix`, que desde Android 10 devuelve
     **`EACCES`**: la app nunca encontraba su propio socket y fallaba al instante.

  Arreglos:
  - socket por nombre directo `webview_devtools_remote_<pid>` (es su propio socket), con
    `/proc/self/net/unix` y `/proc/net/unix` solo como respaldo;
  - frame elegido por capacidad (campo visible **y** botón) y árbol recorrido como JSON;
  - **exclusión mutua**: generar, mejorar y diagnosticar pasan por una cola, así el 🧠 y el render
    no se pisan (era el desencadenante al añadir la mejora de prompt);
  - antes de pulsar *generate* se espera a que el generador esté **libre** y se comprueba que el
    render arrancó de verdad; hasta 3 intentos de clic;
  - la imagen anterior se marca, así nunca se devuelve una vieja ni se descarta una nueva con la
    misma URL;
  - **diagnóstico por etapas** (`ERR:no-socket`, `no-page`, `no-ui`, `no-result`) con mensajes
    claros en la app y trazas `AetherEngine` en logcat;
  - Ajustes → **Diagnóstico del motor** muestra socket, target, frames y estado en el teléfono.

  Validado en navegador real con los scripts exactos, **incluyendo 🧠 → generar**:
  generador libre tras la mejora, arranque confirmado e imagen capturada en **16,4 s**.
- Imágenes del *fallback* de Pollinations con marca de agua: se descartó ese camino.

### Notas

- El APK está firmado con clave de depuración: es una beta para instalar manualmente.
- Requiere Android 7.0+ (API 24).
