import * as Haptics from 'expo-haptics';

let enabled = true;

export const setHapticsEnabled = (value: boolean) => {
  enabled = value;
};

const run = (fn: () => Promise<unknown>) => {
  if (!enabled) return;
  fn().catch(() => undefined);
};

export const tap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const press = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const success = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const warn = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
export const select = () => run(() => Haptics.selectionAsync());
