import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useState } from "react"

// ─────────────────────────────────────────────
// CUSTOMIZE YOUR REMINDERS HERE
// ─────────────────────────────────────────────

const REMINDERS = [
    {
        // Evening reminder — log the day's spending before bed
        title: "The Soul of the Diligent is Richly Supplied 🌱",
        body: "End the day with diligence! Plant a seed of careful planning now, so you can richly sow tomrrow",
        hour: 21,   // 8:00 PM  ← change this number (0–23) to adjust the time
        minute: 0,
    },
    {
        title: "You don't have to be strong to be prepared 🐜",
        body: "The ant isn't strong, but it prepares in the time of preparation. When the Winter comes, it will have enough!",
        hour: 21,
        minute: 0,
    },
    {
        title: "Trust God with All Your Money 🪙",
        body: "The strongest showcase of faith, is knowing how much you have, and letting God freely use it, just like the Widow.",
        hour: 21,
        minute: 0,
    }
];

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

const [reminder, setReminder] = useState(REMINDERS[1])

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
            name: 'Daily Reminders',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

async function scheduleDailyReminders() {
    // Cancel any previously scheduled reminders first
    await Notifications.cancelAllScheduledNotificationsAsync();

    setReminder(REMINDERS[getRandomInt(0, 2)])

    await Notifications.scheduleNotificationAsync({
        content: {
            title: reminder.title,
            body: reminder.body,
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: reminder.hour,
            minute: reminder.minute,
        },
    });
}

export function useNotifications(isReady: boolean) {
    useEffect(() => {
        if (!isReady) return;

        requestPermission().then(granted => {
            if (granted) scheduleDailyReminders();
        });
    }, [isReady]);
}
