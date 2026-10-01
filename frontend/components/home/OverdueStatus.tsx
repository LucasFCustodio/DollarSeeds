/**
 * OverdueStatus — the overdue alert, the most important warning on the home. It
 * renders only when a debt is overdue (the parent gates it on overdue_count > 0).
 *
 * Solid harvest gold with brand text, in the same ink outline as the next-payment
 * card and the tithe line: gold on the green hero breaks the pattern of everything
 * around it, and signals "attention" without the shame of alarm red (no `danger`
 * here). The copy says *needs attention*, never late or missed.
 *
 *   one debt     "{name} needs attention" / "$150 was due Sep 14 · 6 days ago"
 *   two or more  "{n} debts need attention" / up to 3 rows "{name} · $min · due {date}"
 *                and "+{n} more"
 *
 * The button is "Pay now" for a single debt with a safe pay_url (it opens the URL),
 * "Review" otherwise (the Debts tab on the first overdue debt, where the minimum is
 * logged). Tapping the card body also reviews. Every fact comes from the server's
 * debts.overdue; a backend without that list falls back to the title from
 * overdue_count with "Review".
 *
 * On first appearing (once per app launch) it pulses once, with a gold glow and a
 * warning haptic. Reduce Motion skips all three.
 */
import React, { useEffect } from 'react';
import { AccessibilityInfo, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import { IconBell } from '../icons';
import type { OverdueDebt } from '../../lib/homeSummary';
import { isSafeExternal } from '../../lib/announcements';
import { useDebtFormat } from '../debts/format';
import { homeType } from './homeType';

const MAX_ROWS = 3;
const PULSE_MS = 300;
/** Stands in for the debt name inside a translated string, so the name can be its
 *  own Text that truncates first while the rest of the sentence stays whole. */
const SLOT = String.fromCharCode(0x2063); // invisible separator
const NBSP = String.fromCharCode(0xa0);

// Once per app launch, not per focus or month change. Plain module state on purpose.
let pulsedThisLaunch = false;

interface Props {
    count: number;
    /** Undefined from a backend older than debts.overdue. */
    debts?: OverdueDebt[];
    /** Opens the Debts tab, on that debt when given. */
    onOpenDebts: (debtId?: number) => void;
}

export default function OverdueStatus({ count, debts, onOpenDebts }: Props) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const f = useDebtFormat();

    const list = debts ?? [];
    const single = list.length === 1 ? list[0] : null;
    const first = list[0];
    const payUrl = single?.pay_url && isSafeExternal(single.pay_url) ? single.pay_url : null;
    const review = () => onOpenDebts(first?.id);

    // ── the one-time pulse ───────────────────────────────────────────────────
    const pulse = useSharedValue(0);
    useEffect(() => {
        if (pulsedThisLaunch) return;
        pulsedThisLaunch = true;
        let alive = true;
        // Ask first: the live setting can resolve after the first frame, and the
        // pulse must never play with Reduce Motion on, haptic included.
        AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
            if (!alive || reduce) return;
            pulse.value = withSequence(
                withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }),
                withTiming(0, { duration: PULSE_MS, easing: Easing.in(Easing.quad) }),
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }).catch(() => {});
        return () => { alive = false; };
    }, [pulse]);
    const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.02 * pulse.value }] }));
    const glowStyle = useAnimatedStyle(() => ({ opacity: 0.55 * pulse.value }));

    // ── content ─────────────────────────────────────────────────────────────
    const ink = { color: theme.brand };
    let body: React.ReactNode;
    let label: string;
    if (single) {
        const amount = f.money(single.min_payment);
        const [before, after] = around(t('overdueAlert.title', { name: SLOT }));
        body = (
            <>
                <NameLine before={before} name={single.name} after={after} style={[styles.titleText, ink]} />
                {/* Wraps instead of truncating: when the date text doesn't fit beside
                    the amount it drops, whole, onto the next line. */}
                <View style={styles.detail}>
                    <Text style={[homeType.medium, ink]}>{amount}</Text>
                    <Text style={[homeType.verySmall, ink]}>
                        {t('overdueAlert.wasDue', { date: f.dayMonthOf(single.missed_due_date), count: single.days_overdue })}
                    </Text>
                </View>
            </>
        );
        label = t('overdueAlert.a11y', {
            name: single.name, amount, date: f.fullDate(single.missed_due_date), count: single.days_overdue,
        });
    } else {
        const title = t('overdueAlert.titleMany', { count: list.length || count });
        const rows = list.slice(0, MAX_ROWS);
        const more = list.length - rows.length;
        body = (
            <>
                <Text style={[styles.titleText, ink]} numberOfLines={1}>{title}</Text>
                {rows.length > 0 ? (
                    <View style={styles.rows}>
                        {rows.map(d => {
                            const [before, after] = around(t('overdueAlert.row', {
                                name: SLOT, amount: f.money(d.min_payment), date: f.dayMonthOf(d.missed_due_date),
                            }));
                            return <NameLine key={d.id} before={before} name={d.name} after={after} style={[homeType.verySmall, ink]} />;
                        })}
                        {more > 0 ? (
                            <Text style={[homeType.verySmall, ink]}>{t('overdueAlert.more', { count: more })}</Text>
                        ) : null}
                    </View>
                ) : null}
            </>
        );
        label = [title, ...rows.map(d => t('overdueAlert.row', {
            name: d.name, amount: f.money(d.min_payment), date: f.fullDate(d.missed_due_date),
        })), more > 0 ? t('overdueAlert.more', { count: more }) : null].filter(Boolean).join('. ');
    }

    return (
        <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={scaleStyle}
        >
            <Animated.View pointerEvents="none" style={[styles.glow, { backgroundColor: theme.harvest }, glowStyle]} />
            <View style={[styles.card, { backgroundColor: theme.harvest, borderColor: theme.ink, ...(shadow(7) as object) }]}>
                <Pressable
                    onPress={review}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    style={({ pressed }) => [styles.body, pressed && { opacity: 0.75 }]}
                >
                    <View style={[styles.badge, { backgroundColor: theme.brand }]}>
                        <IconBell size={20} color={theme.harvest} />
                    </View>
                    <View style={styles.content}>{body}</View>
                </Pressable>
                <Pressable
                    onPress={payUrl ? () => { Linking.openURL(payUrl).catch(() => review()); } : review}
                    accessibilityRole={payUrl ? 'link' : 'button'}
                    accessibilityLabel={payUrl && single ? t('overdueAlert.payA11y', { name: single.name }) : t('overdueAlert.reviewA11y')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.button, { backgroundColor: theme.brand }, pressed && { opacity: 0.8 }]}
                >
                    <Text style={[styles.buttonText, { color: theme.onBrand }]}>
                        {payUrl ? t('overdueAlert.payNow') : t('overdueAlert.review')}
                    </Text>
                </Pressable>
            </View>
        </Animated.View>
    );
}

/** [text before the name, text after it]. The spaces touching the name become
 *  non-breaking, so splitting it into its own Text can never drop them. */
function around(text: string): [string, string] {
    const i = text.indexOf(SLOT);
    if (i < 0) return [text, ''];
    const nb = (m: string) => NBSP.repeat(m.length);
    return [text.slice(0, i).replace(/ +$/, nb), text.slice(i + SLOT.length).replace(/^ +/, nb)];
}

/** One line where only the name shrinks (ellipsis); the words around it never do. */
function NameLine({ before, name, after, style }: {
    before: string; name: string; after: string; style: StyleProp<TextStyle>;
}) {
    return (
        <View style={styles.nameLine}>
            {before ? <Text style={[style, styles.fixed]} numberOfLines={1}>{before}</Text> : null}
            <Text style={[style, styles.name]} numberOfLines={1}>{name}</Text>
            {after ? <Text style={[style, styles.fixed]} numberOfLines={1}>{after}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    glow: { position: 'absolute', top: -6, bottom: -6, left: -6, right: -6, borderRadius: 24 },
    card: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1.5 },
    body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingLeft: 14, paddingRight: 8 },
    badge: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    content: { flex: 1, gap: 2 },
    titleText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(13) },
    detail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, marginTop: 2 },
    rows: { marginTop: 2, gap: 1 },
    nameLine: { flexDirection: 'row' },
    name: { flexShrink: 1 },
    fixed: { flexShrink: 0 },
    button: { marginRight: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
    buttonText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(13) },
});
