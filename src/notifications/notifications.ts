import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import type { EchoMessage } from '../mesh/types';

/**
 * Local notifications for incoming messages received while the app isn't
 * the active window. SOS always pops; TEXT only pops if the user isn't
 * staring at the channel screen anyway.
 */

let configured = false;

export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('echo.messages', {
      name: 'Echo messages',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120, 60, 120],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('echo.sos', {
      name: 'Echo SOS',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 100, 250, 100, 250],
      bypassDnd: true,
      enableLights: true,
      lightColor: '#FF4438',
      sound: 'default',
    });
  }

  await Notifications.requestPermissionsAsync();
}

/** Returns true if a notification was scheduled, false otherwise. */
export async function notifyIncoming(m: EchoMessage): Promise<boolean> {
  if (m.mine) return false;
  if (m.kind !== 'text' && m.kind !== 'sos') return false;
  if (AppState.currentState === 'active' && m.kind !== 'sos') return false;
  // For SOS we always pop, even when the app is in the foreground.

  const channelId = m.kind === 'sos' ? 'echo.sos' : 'echo.messages';
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: m.kind === 'sos' ? `SOS · ${m.senderName}` : m.senderName,
        body: m.body,
        data: { groupId: m.groupId, senderId: m.senderId, kind: m.kind },
        ...(Platform.OS === 'android' ? { sound: 'default' } : {}),
      },
      trigger: Platform.OS === 'android' ? { channelId } : null,
    });
    return true;
  } catch {
    return false;
  }
}
