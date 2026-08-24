/**
 * NewsModal — announcements published from the Supabase SQL editor, shown in-app.
 *
 * Mounted once at the root beside UpdateGate and StartingBalanceGate (see
 * app/_layout.tsx). State lives in context/AnnouncementsContext.tsx; this file is the
 * rendering, the language pick, and the link handling.
 *
 * ── IT DEFERS TO UpdateGate ───────────────────────────────────────────────────
 * A user below `min_supported_version` is looking at a wall telling them to update.
 * An announcement over that is unreadable and unactionable — and worse, opening it
 * would mark it seen, spending the announcement on someone who never read it. So this
 * renders nothing while the gate is up; the modal simply reappears on the next launch
 * after they update.
 *
 * ── VISUAL ────────────────────────────────────────────────────────────────────
 * Cream (`theme.bg`) with a black outline, deliberately unlike the other modals in
 * this app, which are white `theme.surface` cards floating on a shadow. An
 * announcement is not part of the flow the user was in; looking like a different kind
 * of object is the point.
 */
import React, { useCallback, useMemo } from 'react';
import {
    Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';

import { useAnnouncements } from '../../context/AnnouncementsContext';
import { useLocale } from '../../context/LocaleContext';
import { useTheme, Fonts } from '../../context/ThemeContext';
import { useUpdateBlocked } from '../premium/UpdateGate';
import { ft } from '../../constants/responsive';
import {
    pickLocalized, resolveAnnouncementLink, splitPublishedAt,
} from '../../lib/announcements';
import { IconChevronLeft, IconChevronRight, IconClose } from '../icons';

export default function NewsModal() {
    const { theme } = useTheme();
    const { t } = useTranslation('news');
    const { language, dayMonthYear } = useLocale();
    const router = useRouter();
    const updateBlocked = useUpdateBlocked();
    const { announcements, visible, index, setIndex, close } = useAnnouncements();

    const current = announcements[index];

    // Announcement CONTENT is authored in the database and is deliberately outside the
    // i18n catalogues — see .claude/docs/i18n.md on server-supplied content. The
    // fallback is per FIELD, so a half-translated row still renders sensibly.
    const title = useMemo(
        () => (current ? pickLocalized(current.title, current.title_pt, language) : ''),
        [current, language],
    );
    const body = useMemo(
        () => (current ? pickLocalized(current.body, current.body_pt, language) : ''),
        [current, language],
    );

    // null for "no link", covering a null link_type, an unknown one, a missing target
    // and a malformed one alike — a row typed by hand into SQL must never be able to
    // put a button on screen that crashes or dead-ends when tapped.
    const link = useMemo(
        () => (current ? resolveAnnouncementLink(current) : null),
        [current],
    );

    const published = useMemo(
        () => (current ? splitPublishedAt(current.published_at) : null),
        [current],
    );

    const followLink = useCallback(async () => {
        if (!link) return;
        try {
            if (link.kind === 'external') {
                await WebBrowser.openBrowserAsync(link.target);
            } else {
                // Close first: an internal link lands the user on a real screen, and
                // leaving the modal stacked over it would trap them behind it.
                close();
                router.push(link.target as never);
            }
        } catch (err) {
            // A route resolveAnnouncementLink accepted but expo-router still refuses,
            // or a browser that would not open. Nothing to tell the user — the modal
            // is already closed and the app is where it was.
            console.error('Announcement link error:', err);
        }
    }, [link, close, router]);

    if (!visible || !current || updateBlocked) return null;

    const total = announcements.length;
    const canPrev = index > 0;
    const canNext = index < total - 1;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={close}>
            <View style={styles.overlay}>
                <View
                    accessibilityViewIsModal
                    accessibilityLabel={t('modalA11y')}
                    style={[
                        styles.card,
                        { backgroundColor: theme.bg, borderColor: theme.ink },
                    ]}
                >
                    {/* Eyebrow row — label, unread badge, close */}
                    <View style={styles.topRow}>
                        <Text style={[styles.eyebrow, { color: theme.ink2 }]}>
                            {t('eyebrow')}
                        </Text>
                        {index === 0 ? (
                            <View style={[styles.badge, { backgroundColor: theme.harvest }]}>
                                {/* `brand` on solid harvest, never `ink` — see the harvest
                                    note in .claude/docs/design_system.md. */}
                                <Text style={[styles.badgeText, { color: theme.brand }]}>
                                    {t('badge')}
                                </Text>
                            </View>
                        ) : null}
                        <View style={styles.spacer} />
                        <Pressable
                            onPress={close}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={t('close')}
                            style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                        >
                            <IconClose size={18} color={theme.ink2} />
                        </Pressable>
                    </View>

                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* 1. Heading */}
                        <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>

                        {/* 2. Optional landscape image */}
                        {current.image_url ? (
                            <Image
                                source={{ uri: current.image_url }}
                                style={[styles.image, { backgroundColor: theme.surfaceSoft }]}
                                contentFit="cover"
                                transition={200}
                            />
                        ) : null}

                        {/* 3. Optional link */}
                        {link ? (
                            <Pressable
                                onPress={followLink}
                                accessibilityRole="button"
                                style={({ pressed }) => [
                                    styles.linkBtn,
                                    { backgroundColor: theme.brand },
                                    pressed && { opacity: 0.85 },
                                ]}
                            >
                                <Text style={[styles.linkText, { color: theme.onBrand }]}>
                                    {current.link_label?.trim() || t('link.default')}
                                </Text>
                            </Pressable>
                        ) : null}

                        {/* 4. Body */}
                        <Text style={[styles.body, { color: theme.ink2 }]}>{body}</Text>

                        {/* 5. Date + author. The date is omitted rather than rendered as
                            "Invalid Date" when published_at will not parse. */}
                        <Text style={[styles.meta, { color: theme.ink3 }]}>
                            {published
                                ? t('meta', {
                                    date: dayMonthYear(published.month, published.day, published.year),
                                    author: current.author,
                                })
                                : current.author}
                        </Text>
                    </ScrollView>

                    {/* Navigation across the three most recent. Hidden entirely when
                        there is only one — a permanently disabled pager is noise, and
                        one announcement is the common case. */}
                    {total > 1 ? (
                        <View style={[styles.navRow, { borderTopColor: theme.border }]}>
                            <Pressable
                                onPress={() => canPrev && setIndex(index - 1)}
                                disabled={!canPrev}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={t('nav.previous')}
                                style={({ pressed }) => [
                                    styles.navBtn,
                                    { borderColor: theme.ink },
                                    !canPrev && styles.navDisabled,
                                    pressed && canPrev && { opacity: 0.6 },
                                ]}
                            >
                                <IconChevronLeft size={16} color={theme.ink} />
                            </Pressable>

                            <Text style={[styles.position, { color: theme.ink3 }]}>
                                {t('nav.position', { current: index + 1, total })}
                            </Text>

                            <Pressable
                                onPress={() => canNext && setIndex(index + 1)}
                                disabled={!canNext}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={t('nav.next')}
                                style={({ pressed }) => [
                                    styles.navBtn,
                                    { borderColor: theme.ink },
                                    !canNext && styles.navDisabled,
                                    pressed && canNext && { opacity: 0.6 },
                                ]}
                            >
                                <IconChevronRight size={16} color={theme.ink} />
                            </Pressable>
                        </View>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    // Cream + a black outline, no shadow. Deliberately a different object from the
    // white-card-on-a-shadow modals the rest of the app uses.
    card: {
        width: '100%',
        maxWidth: 460,
        maxHeight: '84%',
        borderRadius: 22,
        borderWidth: 1.5,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 6,
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    spacer: { flex: 1 },
    eyebrow: {
        fontFamily: Fonts.monoSemiBold,
        fontSize: ft(10, 1.2),
        letterSpacing: 1.6,
        textTransform: 'uppercase',
    },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    badgeText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(10, 1.2), letterSpacing: 0.4 },

    scroll: { flexGrow: 0 },
    scrollContent: { paddingBottom: 14 },

    // Larger than the body, per the content order: heading first and unmistakably so.
    title: {
        fontFamily: Fonts.serif,
        fontSize: ft(28, 1.25),
        lineHeight: ft(33, 1.25),
        letterSpacing: -0.4,
        marginBottom: 14,
    },
    image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, marginBottom: 14 },
    linkBtn: {
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 12,
        marginBottom: 14,
    },
    linkText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(14, 1.2) },
    body: { fontFamily: Fonts.sans, fontSize: ft(14, 1.18), lineHeight: ft(21, 1.18) },
    meta: { fontFamily: Fonts.mono, fontSize: ft(11, 1.2), marginTop: 16 },

    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        paddingTop: 10,
        paddingBottom: 8,
    },
    navBtn: {
        width: 34,
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    navDisabled: { opacity: 0.25 },
    position: { fontFamily: Fonts.mono, fontSize: ft(11, 1.2) },
});
