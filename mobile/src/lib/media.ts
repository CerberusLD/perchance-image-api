import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Re-encode an image, which drops every metadata block (EXIF/XMP/ICC extras)
 * that a downloaded file could carry. Used before saving or sharing.
 */
export async function sanitizeCopy(uri: string): Promise<string> {
  if (Platform.OS === 'web') return uri;
  try {
    const context = ImageManipulator.manipulate(uri);
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
    return result.uri;
  } catch {
    return uri;
  }
}

export async function saveToGallery(uri: string): Promise<'saved' | 'denied' | 'error'> {
  if (Platform.OS === 'web') {
    downloadOnWeb(uri);
    return 'saved';
  }
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return 'denied';
    const clean = await sanitizeCopy(uri);
    await MediaLibrary.createAssetAsync(clean);
    return 'saved';
  } catch {
    return 'error';
  }
}

export async function shareImage(uri: string, caption?: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    downloadOnWeb(uri);
    return true;
  }
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const clean = await sanitizeCopy(uri);
    await Sharing.shareAsync(clean, {
      mimeType: 'image/jpeg',
      dialogTitle: caption ?? 'Compartir creación',
      UTI: 'public.jpeg',
    });
    return true;
  } catch {
    return false;
  }
}

function downloadOnWeb(uri: string) {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = uri;
  a.download = `aether-${Date.now()}.jpg`;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
