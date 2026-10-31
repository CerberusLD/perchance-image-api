/**
 * Actualizaciones desde el repositorio del proyecto.
 *
 * Comprueba la última release publicada, descarga el APK al caché de la app y
 * lo entrega al instalador del sistema (módulo nativo `AppInstaller`).
 */

import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { NativeModules, Platform } from 'react-native';

import { UPDATE_CHANNEL } from './config';

const REPO = 'CerberusLD/perchance-image-api';

type InstallerBridge = {
  install: (path: string) => Promise<boolean>;
  canInstall: () => Promise<boolean>;
  openInstallSettings: () => Promise<boolean>;
};

const Installer: InstallerBridge | undefined = (NativeModules as any)?.AppInstaller;

export const CURRENT_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

const parse = (v: string): number[] =>
  v
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);

/** 1 si a > b, -1 si a < b, 0 si iguales. */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export type UpdateInfo = {
  version: string;
  url: string;
  notes: string;
  sizeMB: number;
  publishedAt: string;
};

type Release = {
  tag_name?: string;
  body?: string;
  published_at?: string;
  draft?: boolean;
  assets?: { name?: string; browser_download_url?: string; size?: number }[];
};

/**
 * Devuelve la actualización disponible o `null` si ya está al día.
 * La edición ilimitada solo mira sus propias releases (sufijo `-unlimited`).
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS === 'web') return null;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = (await res.json()) as Release[];

  const mine = list
    .filter((r) => !r.draft && typeof r.tag_name === 'string')
    .filter((r) =>
      UPDATE_CHANNEL === 'unlimited'
        ? /-unlimited$/i.test(r.tag_name!)
        : !/-unlimited$/i.test(r.tag_name!),
    )
    .map((r) => {
      const apk = (r.assets ?? []).find((a) => (a.name ?? '').toLowerCase().endsWith('.apk'));
      if (!apk?.browser_download_url) return null;
      return {
        version: r.tag_name!.replace(/^v/i, ''),
        url: apk.browser_download_url,
        notes: (r.body ?? '').trim(),
        sizeMB: Math.round(((apk.size ?? 0) / (1024 * 1024)) * 10) / 10,
        publishedAt: r.published_at ?? '',
      } as UpdateInfo;
    })
    .filter((x): x is UpdateInfo => x !== null);

  if (!mine.length) return null;
  mine.sort((a, b) => compareVersions(b.version, a.version));
  const latest = mine[0];
  return compareVersions(latest.version, CURRENT_VERSION) > 0 ? latest : null;
}

/** Descarga el APK al caché de la app y devuelve su ruta local. */
export async function downloadUpdate(
  info: UpdateInfo,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const target = new File(Paths.cache, `aether-${info.version}.apk`);
  try {
    if (target.exists) target.delete();
  } catch {
    // si no se puede borrar, downloadFileAsync sobrescribe
  }
  onProgress?.(0.05);
  const out = await File.downloadFileAsync(info.url, target, { idempotent: true });
  onProgress?.(1);
  return out.uri;
}

export async function canInstallPackages(): Promise<boolean> {
  if (!Installer?.canInstall) return false;
  try {
    return await Installer.canInstall();
  } catch {
    return false;
  }
}

export async function openInstallSettings(): Promise<void> {
  try {
    await Installer?.openInstallSettings?.();
  } catch {
    // sin ajustes disponibles: se ignora
  }
}

/** Abre el instalador del sistema con el APK descargado. */
export async function installUpdate(uri: string): Promise<void> {
  if (!Installer?.install) throw new Error('El instalador no está disponible');
  await Installer.install(uri);
}
