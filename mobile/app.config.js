/**
 * Configuración dinámica de Expo.
 *
 * Por defecto se lee `app.json`. Con `EXPO_PUBLIC_UNLIMITED=1` se compila la
 * edición ilimitada: mismo código, otro nombre y otro `applicationId`
 * (lo aplica `plugins/with-engine-devtools.js`), para que pueda convivir con la
 * versión gratis en el mismo teléfono.
 */
const base = require('./app.json');

const unlimited = process.env.EXPO_PUBLIC_UNLIMITED === '1';

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    name: unlimited ? 'Aether Unlimited' : base.expo.name,
    slug: unlimited ? 'aether-studio-unlimited' : base.expo.slug,
    scheme: unlimited ? 'aetherunlimited' : base.expo.scheme,
  },
};
