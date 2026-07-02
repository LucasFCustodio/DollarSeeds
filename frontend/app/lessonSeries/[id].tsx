/**
 * LessonSeriesScreen — a video series' playlist (NEW).
 *
 * Distinct from app/lessonDetail.tsx (which renders the WRITTEN lessons and is not
 * touched here). Fetches GET /lessons/series/{id}/ and lists the ordered video
 * lessons. Tapping a lesson opens the player, passing seriesId + lessonId so the
 * player can rebuild the ordered list for Previous / Next.
 */
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import axios from 'axios';

import { useTheme } from '../../context/ThemeContext';
import { useAnalytics } from '../../lib/analytics';
import { IconChevronLeft, IconChevronRight, IconScripture } from '../../components/icons';

const BASE = 'https://dollarseeds-1.onrender.com';

type SeriesLesson = {
    id: string;
    title: string;
    description?: string | null;
    duration_seconds?: number | null;
    thumbnail_url?: string | null;
    sort_order: number;
};

type SeriesDetail = {
    id: string;
    title: string;
    description?: string | null;
    creator?: string | null;
    thumbnail_url?: string | null;
    lessons: SeriesLesson[];
};

function formatDuration(seconds?: number | null): string | null {
    if (!seconds || seconds <= 0) return null;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default function LessonSeriesScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { theme } = useTheme();
    const analytics = useAnalytics();

    const [detail, setDetail] = useState<SeriesDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(() => {
        if (!id) return;
        setLoading(true);
        setError(false);
        axios.get(`${BASE}/lessons/series/${id}/`)
            .then(res => setDetail(res.data?.data ?? null))
            .catch(err => {
                console.error('Series detail error:', err);
                setError(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            {/* Back button */}
            <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [
                    styles.backBtn,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    pressed && { opacity: 0.7 },
                ]}
            >
                <IconChevronLeft size={18} color={theme.ink} />
            </Pressable>

            {loading ? (
                <View style={styles.stateBox}><ActivityIndicator color={theme.brand} /></View>
            ) : error || !detail ? (
                <View style={styles.stateBox}>
                    <Text style={[styles.stateText, { color: theme.ink3 }]}>
                        Couldn&apos;t load this series.
                    </Text>
                    <Pressable onPress={load} hitSlop={8}>
                        <Text style={[styles.retryText, { color: theme.brand }]}>Tap to retry</Text>
                    </Pressable>
                </View>
            ) : (
                <>
                    {/* Series header */}
                    {detail.thumbnail_url ? (
                        <Image
                            source={{ uri: detail.thumbnail_url }}
                            style={styles.hero}
                            contentFit="cover"
                            transition={200}
                        />
                    ) : null}

                    <Text style={[styles.title, { color: theme.ink }]}>{detail.title}</Text>
                    {!!detail.creator && (
                        <Text style={[styles.creator, { color: theme.ink3 }]}>
                            {detail.creator}
                        </Text>
                    )}
                    {!!detail.description && (
                        <Text style={[styles.description, { color: theme.ink2 }]}>
                            {detail.description}
                        </Text>
                    )}

                    {/* Lesson list */}
                    <Text style={[styles.sectionEyebrow, { color: theme.ink3 }]}>
                        {detail.lessons.length} {detail.lessons.length === 1 ? 'LESSON' : 'LESSONS'}
                    </Text>

                    <View style={styles.lessonList}>
                        {detail.lessons.length === 0 ? (
                            <Text style={[styles.stateText, { color: theme.ink3 }]}>
                                No lessons in this series yet.
                            </Text>
                        ) : detail.lessons.map((lesson, index) => {
                            const dur = formatDuration(lesson.duration_seconds);
                            return (
                                <Pressable
                                    key={lesson.id}
                                    onPress={() => {
                                        analytics.lessonVideoClicked({
                                            series_id: detail.id,
                                            lesson_id: lesson.id,
                                            title: lesson.title,
                                        });
                                        router.push({
                                            pathname: '/lessonPlayer',
                                            params: { seriesId: detail.id, lessonId: lesson.id },
                                        } as any);
                                    }}
                                    style={({ pressed }) => [
                                        styles.lessonRow,
                                        { backgroundColor: theme.surface, borderColor: theme.ink },
                                        pressed && { transform: [{ scale: 0.99 }], opacity: 0.9 },
                                    ]}
                                >
                                    <View style={[styles.indexTile, { backgroundColor: theme.surfaceSoft, borderColor: theme.brand }]}>
                                        <Text style={[styles.indexText, { color: theme.brand }]}>
                                            {String(index + 1).padStart(2, '0')}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.lessonTitle, { color: theme.ink }]} numberOfLines={2}>
                                            {lesson.title}
                                        </Text>
                                        {dur && (
                                            <Text style={[styles.lessonDuration, { color: theme.ink3 }]}>
                                                {dur}
                                            </Text>
                                        )}
                                    </View>
                                    <IconChevronRight size={18} color={theme.ink3} />
                                </Pressable>
                            );
                        })}
                    </View>
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 20,
        paddingTop: 54,
        paddingBottom: 56,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 22,
        alignSelf: 'flex-start',
    },
    stateBox: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 60,
    },
    stateText: {
        fontFamily: 'Geist-Regular',
        fontSize: 14,
    },
    retryText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 14,
    },
    hero: {
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: 16,
        marginBottom: 18,
    },
    title: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 32,
        letterSpacing: -0.5,
        lineHeight: 36,
        marginBottom: 6,
    },
    creator: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 12,
        marginBottom: 12,
    },
    description: {
        fontFamily: 'Geist-Regular',
        fontSize: 14,
        lineHeight: 21,
        marginBottom: 24,
    },
    sectionEyebrow: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 10,
        letterSpacing: 1.6,
        marginBottom: 12,
    },
    lessonList: {
        gap: 10,
    },
    lessonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1.5,
    },
    indexTile: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    indexText: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 17,
        lineHeight: 20,
    },
    lessonTitle: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 15,
        letterSpacing: -0.1,
    },
    lessonDuration: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        marginTop: 3,
    },
});
