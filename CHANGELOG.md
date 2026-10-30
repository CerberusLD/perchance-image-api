# Changelog

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

- **Timeout al generar en la app** (dos causas encadenadas):
  1. el motor elegía el primer frame con `textarea` (la página externa, con campos ocultos) en vez
     del frame real del generador;
  2. el árbol de frames se leía con una regex que exigía `id → loaderId → url`, pero los frames
     hijos añaden `parentId` en medio, así que **solo se veía el frame raíz**.

  Ahora el frame se elige por capacidad (campo visible **y** botón de generar) y el árbol se recorre
  como JSON (`childFrames`). Además: reintentos al abrir el socket CDP, `#generateButtonEl` con
  alternativas, reintento del clic a los 25 s, sondeo de **todos** los frames y trazas
  `AetherEngine` en logcat. Validado en navegador real con el mismo código: imagen en ~15 s.
- Imágenes del *fallback* de Pollinations con marca de agua: se descartó ese camino.

### Notas

- El APK está firmado con clave de depuración: es una beta para instalar manualmente.
- Requiere Android 7.0+ (API 24).
