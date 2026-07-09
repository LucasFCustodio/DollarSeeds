/**
 * LessonsScreen — visual revamp (DollarSeeds design system)
 *
 * Page order (top → bottom):
 *   1. Header ("Lessons from the field" + subtitle) — unchanged
 *   2. Video SERIES list (NEW) — cloud-hosted video series from GET /lessons/series/
 *   3. "lessons completed" progress strip — unchanged behavior, just repositioned below the series
 *   4. Written-lesson cards — unchanged
 *
 * Behaviour preserved (written lessons):
 * ✅ Completed lesson IDs stored in AsyncStorage ('completed_lessons')
 * ✅ Star ratings stored locally; user prompted to share with backend
 * ✅ Tap card → lessonDetail screen
 * ✅ Progress bar reflects completed / total  (tied to the WRITTEN LESSONS only)
 *
 * NOTE: the video series intentionally does NOT touch the progress strip. Persistent
 * video watch-progress (resume position / marking a *video* lesson complete / wiring
 * videos into this strip) is deferred — see the series-detail + player screens.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme, stickerShadow, AppTheme } from '../../context/ThemeContext';
import { ft, tv } from '../../constants/responsive';
import { useAnalytics } from '../../lib/analytics';
import AnimatedProgressBar from '../../components/ui/AnimatedProgressBar';
import Card from '../../components/ui/Card';
import { IconCheck, IconScripture, IconStar } from '../../components/icons';
import { LESSONS } from '../../constants/lessons';

const BASE = 'https://dollarseeds-1.onrender.com';
const STORAGE_KEY = 'completed_lessons';

type Series = {
    id: string;
    title: string;
    description?: string | null;
    creator?: string | null;
    thumbnail_url?: string | null;
    lesson_count: number;
};

export default function LessonsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme } = useTheme();
    const analytics = useAnalytics();

    const [completedIds, setCompletedIds] = useState<number[]>([]);
    const [ratings, setRatings] = useState<Record<number, number>>({});

    // ── Video series (new) ───────────────────────────────────────
    const [series, setSeries] = useState<Series[]>([]);
    const [seriesLoading, setSeriesLoading] = useState(true);
    const [seriesError, setSeriesError] = useState(false);

    const loadSeries = useCallback(() => {
        setSeriesLoading(true);
        setSeriesError(false);
        axios.get(`${BASE}/lessons/series/`)
            .then(res => setSeries(res.data?.data ?? []))
            .catch(err => {
                console.error('Series load error:', err);
                setSeriesError(true);
            })
            .finally(() => setSeriesLoading(false));
    }, []);

    useEffect(() => { loadSeries(); }, [loadSeries]);

    useFocusEffect(
        useCallback(() => {
            AsyncStorage.getItem(STORAGE_KEY).then(val => {
                if (val) setCompletedIds(JSON.parse(val));
            });
        }, []),
    );

    const completedCount = completedIds.length;
    const totalCount = LESSONS.length;
    const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    const progressLabel = Math.round(progressPct);

    const handleStarPress = (lessonId: number, star: number) => {
        setRatings(prev => ({ ...prev, [lessonId]: star }));
        Alert.alert(
            'Share Your Rating?',
            'Would you like to share this rating with us to help improve the app?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes',
                    onPress: () => {
                        axios.post(`${BASE}/lesson-ratings/`, {
                            user_id: user?.id,
                            lesson_id: lessonId,
                            rating: star,
                        }).catch(err => console.error('Rating submit error:', err));
                    },
                },
            ],
        );
    };

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Header ──────────────────────────────────────────── */}
            <View style={styles.header}>
                <Text style={[styles.title, { color: theme.ink }]}>
                    {'Lessons\nfrom the field'}
                </Text>
                <Text style={[styles.subtitle, { color: theme.ink2 }]}>
                    Scripture-rooted reflections on money, generosity, and stewardship.
                </Text>
            </View>

            {/* ── Video series (NEW) ──────────────────────────────── */}
            <View style={styles.seriesSection}>
                <Text style={[styles.sectionEyebrow, { color: theme.ink3 }]}>
                    WATCH & LEARN
                </Text>

                {seriesLoading ? (
                    <View style={styles.seriesStateBox}>
                        <ActivityIndicator color={theme.brand} />
                    </View>
                ) : seriesError ? (
                    <View style={styles.seriesStateBox}>
                        <Text style={[styles.seriesStateText, { color: theme.ink3 }]}>
                            Couldn&apos;t load video series.
                        </Text>
                        <Pressable onPress={loadSeries} hitSlop={8}>
                            <Text style={[styles.retryText, { color: theme.brand }]}>Tap to retry</Text>
                        </Pressable>
                    </View>
                ) : series.length === 0 ? (
                    <View style={styles.seriesStateBox}>
                        <Text style={[styles.seriesStateText, { color: theme.ink3 }]}>
                            No video series yet — check back soon.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.seriesList}>
                        {series.map(s => (
                            <SeriesCard
                                key={s.id}
                                theme={theme}
                                series={s}
                                onExplore={() => {
                                    analytics.seriesExploreClicked({ series_id: s.id, title: s.title });
                                    router.push({
                                        pathname: '/lessonSeries/[id]',
                                        params: { id: s.id },
                                    } as any);
                                }}
                            />
                        ))}
                    </View>
                )}
            </View>

            {/* ── Progress strip (written lessons — unchanged behavior) ── */}
            <View style={styles.progressSection}>
                <View style={styles.progressRow}>
                    <View style={{ flex: 1 }}>
                        <AnimatedProgressBar
                            value={progressPct}
                            color={theme.brand}
                            bg={theme.borderSoft}
                            height={6}
                        />
                        <Text style={[styles.progressLabel, { color: theme.ink3 }]}>
                            {completedCount} of {totalCount} lessons completed
                        </Text>
                    </View>
                    <View style={[styles.progressBadge, { backgroundColor: theme.surfaceSoft }]}>
                        <Text style={[styles.progressBadgeText, { color: theme.brand }]}>
                            {progressLabel}%
                        </Text>
                    </View>
                </View>
            </View>

            {/* ── Written lesson cards (unchanged) ────────────────── */}
            <View style={styles.cardList}>
                {LESSONS.map((lesson, index) => {
                    const done = completedIds.includes(lesson.id);
                    const rating = ratings[lesson.id] ?? 0;

                    return (
                        <Card
                            key={lesson.id}
                            theme={theme}
                            depth={5}
                            padding={18}
                            style={styles.lessonCard}
                            onPress={() => {
                                analytics.writtenLessonOpened({ lesson_id: lesson.id, title: lesson.title });
                                router.push({
                                    pathname: '/lessonDetail',
                                    params: { id: lesson.id },
                                } as any);
                            }}
                        >
                            <View style={styles.cardRow}>
                                {/* Icon tile — done vs not done */}
                                {done ? (
                                    <View style={[
                                        styles.iconTile,
                                        { backgroundColor: theme.brand },
                                    ]}>
                                        <IconCheck size={18} color="#fff" />
                                    </View>
                                ) : (
                                    <View style={[
                                        styles.iconTile,
                                        {
                                            backgroundColor: theme.surfaceSoft,
                                            borderWidth: 1.5,
                                            borderColor: theme.brand,
                                        },
                                    ]}>
                                        <Text style={[styles.lessonNumber, { color: theme.brand }]}>
                                            {String(index + 1).padStart(2, '0')}
                                        </Text>
                                    </View>
                                )}

                                {/* Content */}
                                <View style={{ flex: 1 }}>
                                    {/* Title + minutes */}
                                    <View style={styles.titleRow}>
                                        <Text style={[styles.lessonTitle, { color: theme.ink }]}>
                                            {lesson.title}
                                        </Text>
                                        <Text style={[styles.minutesLabel, { color: theme.ink3 }]}>
                                            {lesson.minutes} min
                                        </Text>
                                    </View>

                                    {/* Description */}
                                    <Text style={[styles.lessonDesc, { color: theme.ink2 }]}>
                                        {lesson.description}
                                    </Text>

                                    {/* Bottom row: verse badge + stars */}
                                    <View style={styles.cardFooter}>
                                        {/* Scripture badge */}
                                        <View style={[
                                            styles.verseBadge,
                                            { backgroundColor: theme.surfaceSoft },
                                        ]}>
                                            <IconScripture size={12} color={theme.brand} />
                                            <Text style={[styles.verseText, { color: theme.brand }]}>
                                                {lesson.verse}
                                            </Text>
                                        </View>

                                        {/* Stars */}
                                        <View style={styles.starsRow}>
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <Pressable
                                                    key={star}
                                                    onPress={e => {
                                                        e.stopPropagation?.();
                                                        handleStarPress(lesson.id, star);
                                                    }}
                                                    hitSlop={6}
                                                >
                                                    <IconStar
                                                        size={16}
                                                        color={star <= rating ? '#D4B254' : theme.border}
                                                        filled={star <= rating}
                                                    />
                                                </Pressable>
                                            ))}
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </Card>
                    );
                })}
            </View>
        </ScrollView>
    );
}

/**
 * SeriesCard — video-series card matching the approved design + the dashboard card
 * system (white surface, ink outline + sticker shadow). All colors from useTheme().
 * - Left-aligned title
 * - Full-width thumbnail with a "{n} lessons" badge bottom-right
 * - Left-aligned description with a MIN-HEIGHT so short/long cards share a rhythm
 * - "Explore ›" brand button, bottom-aligned, right edge = thumbnail's right edge
 */
function SeriesCard({
    theme, series, onExplore,
}: {
    theme: AppTheme;
    series: Series;
    onExplore: () => void;
}) {
    const lessonWord = series.lesson_count === 1 ? 'lesson' : 'lessons';
    return (
        <Card theme={theme} depth={5} padding={16} style={styles.seriesCard}>
            {/* Title */}
            <Text style={[styles.seriesTitle, { color: theme.ink }]}>
                {series.title}
            </Text>

            {/* Thumbnail + lesson-count badge */}
            <View style={styles.thumbWrap}>
                {series.thumbnail_url ? (
                    <Image
                        source={{ uri: series.thumbnail_url }}
                        style={styles.thumb}
                        contentFit="cover"
                        transition={200}
                    />
                ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: theme.surfaceSoft }]}>
                        <IconScripture size={26} color={theme.ink3} />
                    </View>
                )}
                <View style={[styles.lessonBadge, { backgroundColor: theme.brand }]}>
                    <Text style={[styles.lessonBadgeText, { color: theme.onBrand }]}>
                        {series.lesson_count} {lessonWord}
                    </Text>
                </View>
            </View>

            {/* Description (min-height for uniform card rhythm) */}
            {!!series.description && (
                <Text style={[styles.seriesDesc, { color: theme.ink2 }]}>
                    {series.description}
                </Text>
            )}

            {/* Explore button — bottom, right-aligned to the thumbnail edge */}
            <View style={styles.exploreRow}>
                <Pressable
                    onPress={onExplore}
                    style={({ pressed }) => [
                        styles.exploreBtn,
                        { backgroundColor: theme.brand, ...(stickerShadow(theme.ink) as object) },
                        pressed && { transform: [{ scale: 0.97 }] },
                    ]}
                >
                    <Text style={[styles.exploreText, { color: theme.onBrand }]}>Explore ›</Text>
                </Pressable>
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingBottom: 60,
    },

    // Header
    header: {
        paddingTop: 60,
        paddingHorizontal: 22,
        paddingBottom: 8,
    },
    title: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: ft(36, 1.3),
        letterSpacing: -0.5,
        lineHeight: ft(38, 1.3),
        marginBottom: 10,
    },
    subtitle: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(13, 1.18),
        lineHeight: ft(19, 1.18),
        maxWidth: tv(280, 440),
        marginBottom: 4,
    },

    // Video series section
    seriesSection: {
        paddingHorizontal: 18,
        paddingTop: 14,
    },
    sectionEyebrow: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: ft(10, 1.25),
        letterSpacing: 1.6,
        marginLeft: 4,
        marginBottom: 12,
    },
    seriesStateBox: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 28,
    },
    seriesStateText: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(13, 1.18),
    },
    retryText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(13, 1.2),
    },
    seriesList: {
        gap: 16,
    },
    seriesCard: {
        // spacing between series cards handled by seriesList gap
    },
    seriesTitle: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: ft(24, 1.3),
        lineHeight: ft(28, 1.3),
        letterSpacing: -0.3,
        marginBottom: 12,
    },
    thumbWrap: {
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
    },
    thumb: {
        width: '100%',
        aspectRatio: 16 / 10,
        borderRadius: 12,
    },
    thumbPlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    lessonBadge: {
        position: 'absolute',
        right: 8,
        bottom: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    lessonBadgeText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(11, 1.18),
    },
    seriesDesc: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(13, 1.18),
        lineHeight: ft(19, 1.18),
        marginTop: 12,
        minHeight: 57, // ~3 lines — keeps short/long cards on the same rhythm
    },
    exploreRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 12,
    },
    exploreBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
    },
    exploreText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(14, 1.2),
    },

    // Progress strip (moved below the series; behavior unchanged)
    progressSection: {
        paddingHorizontal: 22,
        paddingTop: 24,
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    progressLabel: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: ft(11, 1.18),
        marginTop: 6,
    },
    progressBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    progressBadgeText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(12, 1.2),
    },

    // Written lesson card list
    cardList: {
        paddingHorizontal: 18,
        paddingTop: 20,
        gap: 12,
    },
    lessonCard: {
        // gap between cards handled by cardList gap
    },

    // Card internals
    cardRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },
    iconTile: {
        width: 44,
        height: 44,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    lessonNumber: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: ft(18, 1.2),
        lineHeight: ft(22, 1.2),
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 4,
    },
    lessonTitle: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(15, 1.28),
        letterSpacing: -0.1,
        flex: 1,
    },
    minutesLabel: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: ft(11, 1.18),
        flexShrink: 0,
        marginTop: 1,
    },
    lessonDesc: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(13, 1.18),
        lineHeight: ft(19, 1.18),
        marginBottom: 10,
    },

    // Card footer
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    verseBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    verseText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(11, 1.18),
    },
    starsRow: {
        flexDirection: 'row',
        gap: 2,
    },
});
