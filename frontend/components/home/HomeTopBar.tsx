/**
 * HomeTopBar — profile, the month (tap to pick another), News and Settings.
 * Sits straight on the cream page; no container.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAnnouncements } from '../../context/AnnouncementsContext';
import { IconChevronDown, IconGearMascot, IconMail, IconUser } from '../icons';
import { homeType } from './homeType';

interface Props {
    month: string;
    onOpenMonthPicker: () => void;
}

export default function HomeTopBar({ month, onOpenMonthPicker }: Props) {
    const router = useRouter();
    const { theme } = useTheme();
    const { monthYear } = useLocale();
    const { t } = useTranslation('dashboard');
    const { t: tn } = useTranslation('news');
    const { unread, open, announcements } = useAnnouncements();

    const roundBtn = [styles.roundBtn, { backgroundColor: theme.surface, borderColor: theme.border }];

    return (
        <View style={styles.row}>
            {/* Profile — no action yet; the future entry point for customization. */}
            <View
                style={[styles.profile, { backgroundColor: theme.brandSoft }]}
                accessibilityRole="image"
                accessibilityLabel={t('topBar.profileA11y')}
            >
                <IconUser size={20} color={theme.brand} />
            </View>

            <Pressable
                onPress={onOpenMonthPicker}
                accessibilityRole="button"
                accessibilityLabel={t('topBar.monthA11y', { month: monthYear(month, new Date().getFullYear()) })}
                hitSlop={10}
                style={({ pressed }) => [styles.date, pressed && { opacity: 0.6 }]}
            >
                <Text style={[homeType.small, { color: theme.ink }]}>
                    {monthYear(month, new Date().getFullYear())}
                </Text>
                <IconChevronDown size={14} color={theme.ink} />
            </Pressable>

            <View style={styles.controls}>
                {/* Hidden until there is something to show: a button that opens an
                    empty modal is worse than no button. */}
                {announcements.length > 0 ? (
                    <Pressable
                        onPress={open}
                        accessibilityRole="button"
                        accessibilityLabel={tn('buttonA11y')}
                        style={({ pressed }) => [roundBtn, pressed && { opacity: 0.7 }]}
                    >
                        <IconMail size={18} color={theme.ink} />
                        {unread ? (
                            <View style={[styles.unreadDot, { backgroundColor: theme.harvest, borderColor: theme.surface }]} />
                        ) : null}
                    </Pressable>
                ) : null}
                <Pressable
                    onPress={() => router.push('/settings' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={t('topBar.settingsA11y')}
                    style={({ pressed }) => [roundBtn, pressed && { opacity: 0.7 }]}
                >
                    <IconGearMascot size={18} color={theme.ink} />
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    profile: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    // Absolutely centred, so the date sits in the middle of the screen whether or
    // not the News button is showing on the right.
    date: {
        position: 'absolute', left: 0, right: 0, alignSelf: 'center',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
        marginHorizontal: 100,
    },
    controls: { flexDirection: 'row', gap: 8 },
    roundBtn: {
        width: 38, height: 38, borderRadius: 999, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
    },
    // Absolutely positioned so it cannot change the button's box — the mail button
    // stays pixel-identical in size to the gear beside it.
    unreadDot: {
        position: 'absolute', top: 6, right: 6,
        width: 9, height: 9, borderRadius: 999, borderWidth: 1.5,
    },
});
