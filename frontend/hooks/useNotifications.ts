import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import i18n from '../lib/i18n';

// ─────────────────────────────────────────────
// CUSTOMIZE YOUR REMINDERS HERE
//
// The COPY lives in locales/<lang>/notifications.json under `reminders.<key>`;
// only the schedule lives here. Add a reminder by adding a key in both places.
// ─────────────────────────────────────────────

const REMINDERS = [
    // Evening reminder — log the day's spending before bed
    { key: 'diligent', hour: 21, minute: 0 },   // 9:00 PM ← change (0–23) to adjust
    { key: 'ant', hour: 21, minute: 0 },
    { key: 'widow', hour: 21, minute: 0 },
];

// ─────────────────────────────────────────────

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

async function requestPermission(): Promise<boolean> {
    if (!Device.isDevice) return false; // simulators can't receive push notifications

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('daily-reminders', {
            // Visible in the Android system settings, so it needs translating too —
            // easy to miss, because it never appears inside the app.
            name: i18n.t('notifications:channelName'),
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

/**
 * Cancel everything and schedule one daily reminder in the CURRENT language.
 *
 * Exported because the language setter calls it directly. Scheduling happens at the
 * OS level, so a notification queued in English stays English until it is replaced —
 * re-running this on a mount effect alone would leave a user who switched language and
 * force-quit receiving English reminders indefinitely.
 */
export async function scheduleDailyReminders() {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const reminder = REMINDERS[Math.floor(Math.random() * REMINDERS.length)];

    await Notifications.scheduleNotificationAsync({
        content: {
            title: i18n.t(`notifications:reminders.${reminder.key}.title`),
            body: i18n.t(`notifications:reminders.${reminder.key}.body`),
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: reminder.hour,
            minute: reminder.minute,
        },
    });
}

/** Re-schedule in the active language, if permission was already granted. */
export async function rescheduleRemindersForLanguage() {
    try {
        if (!Device.isDevice) return;
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('daily-reminders', {
                name: i18n.t('notifications:channelName'),
                importance: Notifications.AndroidImportance.DEFAULT,
                sound: 'default',
            });
        }
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') await scheduleDailyReminders();
    } catch (err) {
        // A reminder in the previous language is a cosmetic problem; failing to
        // change language over it would not be.
        console.warn('Could not re-schedule reminders:', err);
    }
}

export function useNotifications(isReady: boolean) {
    useEffect(() => {
        if (!isReady) return;

        requestPermission().then(granted => {
            if (granted) scheduleDailyReminders();
        });
    }, [isReady]);
}
