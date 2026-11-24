import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Prepares the Android notification channel for future payment due reminders.
 */
export async function configureNotificationsChannelAsync(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("kredimax-cuotas", {
      name: "Recordatorios de Cuotas KrediMax",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: "#16A085",
    });
  } catch {
    // Ignore channel setup errors on emulators without Google Play Services
  }
}
