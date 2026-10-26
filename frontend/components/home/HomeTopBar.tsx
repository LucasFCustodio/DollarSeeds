/**
 * HomeTopBar — profile, the overdue alert (only while a debt is overdue), the month
 * (tap to drop down the month wheel), News and Settings.
 * Sits straight on the green Analyze band; no container. Its buttons are the old
 * dashboard hero's glass buttons, with onBrand glyphs.
 */
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAnnouncements } from '../../context/AnnouncementsContext';
import { IconChevronDown, IconGearMascot, IconMail, IconUser } from '../icons';
import { GLASS, homeType } from './homeType';
import MonthDropdown, { type Anchor } from './MonthDropdown';
import OverdueAlert from './OverdueAlert';
import type { OverdueDebt } from '../../lib/homeSummary';

interface Props {
    month: string;
    /** 0–11 */
    selected: number;
    onPickMonth: (index: number) => void;
    /** 0 hides the overdue alert. The parent passes 0 without Debt Freedom (flag off or not premium). */
    overdueCount: number;
    /** Undefined from a backend older than debts.overdue. */
    overdue?: OverdueDebt[];
    onOpenDebts: (debtId?: number) => void;
}

export default function HomeTopBar({ month, selected, onPickMonth, overdueCount, overdue, onOpenDebts }: Props) {
    const router = useRouter();
    const { theme } = useTheme();
    const { monthYear } = useLocale();
    const { t } = useTranslation('dashboard');
    const { t: tn } = useTranslation('news');
    const { unread, open, announcements } = useAnnouncements();

    const dateRef = useRef<View>(null);
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const toggleMonths = () => {
        if (anchor) { setAnchor(null); return; }
        dateRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
    };

    const roundBtn = [styles.roundBtn, { backgroundColor: GLASS.fill, borderColor: GLASS.border }];

    return (
        <View style={styles.row}>
            <View style={styles.leading}>
                {/* Profile — no action yet; the future entry point for customization. */}
                <View
                    style={[styles.profile, { backgroundColor: GLASS.fill, borderColor: GLASS.border }]}
                    accessibilityRole="image"
                    accessibilityLabel={t('topBar.profileA11y')}
                >
                    <IconUser size={20} color={theme.onBrand} />
                </View>
                {overdueCount > 0 ? (
                    <OverdueAlert count={overdueCount} debts={overdue} onOpenDebts={onOpenDebts} />
                ) : null}
            </View>

            <Pressable
                ref={dateRef}
                onPress={toggleMonths}
                accessibilityRole="button"
                accessibilityLabel={t('topBar.monthA11y', { month: monthYear(month, new Date().getFullYear()) })}
                hitSlop={10}
                style={({ pressed }) => [styles.date, pressed && { opacity: 0.6 }]}
            >
                <Text style={[homeType.small, { color: theme.onBrand }]}>
                    {monthYear(month, new Date().getFullYear())}
                </Text>
                <IconChevronDown size={14} color={theme.onBrand} />
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
                        <IconMail size={18} color={theme.onBrand} />
                        {unread ? (
                            <View style={[styles.unreadDot, { backgroundColor: theme.harvest, borderColor: theme.paintedForest }]} />
                        ) : null}
                    </Pressable>
                ) : null}
                <Pressable
                    onPress={() => router.push('/settings' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={t('topBar.settingsA11y')}
                    style={({ pressed }) => [roundBtn, pressed && { opacity: 0.7 }]}
                >
                    <IconGearMascot size={18} color={theme.onBrand} />
                </Pressable>
            </View>
            <MonthDropdown anchor={anchor} selected={selected} onPick={onPickMonth} onClose={() => setAnchor(null)} />
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    // The News–Settings gap. Above the date, whose full-width strip (and hitSlop)
    // would otherwise take taps on a wide (two-digit) alert pill.
    leading: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 1 },
    profile: { width: 36, height: 36, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    // Absolutely centred, so the date sits in the middle of the screen whether or
    // not the overdue alert (left) or the News button (right) is showing.
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
