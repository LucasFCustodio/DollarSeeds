/**
 * LessonPlayerScreen — plays one video lesson (NEW).
 *
 * Flow: reads { seriesId, lessonId } params, fetches the series once (for the ordered
 * lesson list → Previous / Next) and GET /lessons/{lessonId}/playback/ for a short-lived
 * SIGNED URL, then plays it with expo-video using the built-in NATIVE controls.
 *
 * Playback controls (play/pause, seek, scrubber, fullscreen) are entirely NATIVE via
 * <VideoView nativeControls />. We intentionally do NOT build any custom scrubber or
 * play/pause UI — only the Previous / Next lesson buttons, which swap the active lesson
 * within the series (re-fetching that lesson's signed URL).
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import axios from 'axios';

import { useTheme } from '../context/ThemeContext';
import { useAnalytics } from '../lib/analytics';
import { IconChevronLeft, IconChevronRight } from '../components/icons';

const BASE = 'https://dollarseeds-1.onrender.com';

type SeriesLesson = {
    id: string;
    title: string;
    duration_seconds?: number | null;
    sort_order: number;
};

export default function LessonPlayerScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const analytics = useAnalytics();
    const params = useLocalSearchParams<{ seriesId: string; lessonId: string }>();
    const seriesId = params.seriesId;

    const [lessons, setLessons] = useState<SeriesLesson[]>([]);
    const [currentId, setCurrentId] = useState<string>(params.lessonId);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    // Single player instance; source is swapped via replaceAsync as the lesson changes.
    const player = useVideoPlayer(null, p => { p.loop = false; });

    // Fetch the series once to get the ordered lesson list (drives Previous / Next).
    useEffect(() => {
        if (!seriesId) return;
        axios.get(`${BASE}/lessons/series/${seriesId}/`)
            .then(res => setLessons(res.data?.data?.lessons ?? []))
            .catch(err => console.error('Series order load error:', err));
    }, [seriesId]);

    // Load the signed URL and start playback whenever the active lesson changes.
    useEffect(() => {
        if (!currentId) return;
        let cancelled = false;
        setLoading(true);
        setError(false);

        // DEFER: persistent video watch-progress goes here — resume the saved position
        // (e.g. player.currentTime = savedSeconds) after replaceAsync, and elsewhere
        // mark this VIDEO lesson complete / persist progress in a lesson_progress table.
        // Not built yet; the written-lessons "lessons completed" strip is unaffected.
        axios.get(`${BASE}/lessons/${currentId}/playback/`)
            .then(async res => {
                if (cancelled) return;
                const url = res.data?.url;
                if (!url) { setError(true); return; }
                await player.replaceAsync(url);
                if (!cancelled) player.play();
            })
            .catch(err => {
                if (cancelled) return;
                console.error('Playback load error:', err);
                setError(true);
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [currentId, player]);

    // ── Progress heartbeat (analytics only — NO persistent watch-progress store) ──
    // Every 15s, but ONLY while the video is actively playing, emit lesson_progress
    // with the current position. Also emit lesson_video_completed at end-of-playback
    // so completion rate / drop-off are computable. The interval + end listener are
    // (re)created per active lesson and torn down on unmount AND on lesson change
    // (this effect depends on currentId, so its cleanup runs when the lesson swaps).
    useEffect(() => {
        if (!currentId || !seriesId) return;

        const interval = setInterval(() => {
            // Skip paused / buffering / not-ready — those must not count as watch time.
            if (!player.playing || player.status !== 'readyToPlay') return;
            analytics.lessonProgress({
                series_id: seriesId,
                lesson_id: currentId,
                position_seconds: player.currentTime,
                duration_seconds: player.duration,
            });
        }, 15000);

        const endSub = player.addListener('playToEnd', () => {
            analytics.lessonVideoCompleted({ series_id: seriesId, lesson_id: currentId });
        });

        return () => {
            clearInterval(interval);
            endSub.remove();
        };
        // `analytics` intentionally excluded: it wraps a stable PostHog client, and
        // including it would rebuild the interval on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player, currentId, seriesId]);

    const index = lessons.findIndex(l => l.id === currentId);
    const hasPrev = index > 0;
    const hasNext = index >= 0 && index < lessons.length - 1;
    const currentTitle = index >= 0 ? lessons[index].title : '';
    const position = index >= 0 ? `Lesson ${index + 1} of ${lessons.length}` : '';

    const goPrev = useCallback(() => {
        if (hasPrev) setCurrentId(lessons[index - 1].id);
    }, [hasPrev, lessons, index]);

    const goNext = useCallback(() => {
        if (hasNext) setCurrentId(lessons[index + 1].id);
    }, [hasNext, lessons, index]);

    return (
        <View style={[styles.container, { backgroundColor: theme.bg }]}>
            {/* Back */}
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

            {/* Video surface (native controls handle play/pause, seek, scrubber, fullscreen) */}
            <View style={styles.videoWrap}>
                <VideoView
                    player={player}
                    style={styles.video}
                    nativeControls
                    contentFit="contain"
                    allowsFullscreen
                    allowsPictureInPicture
                />
                {loading && (
                    <View style={styles.videoOverlay} pointerEvents="none">
                        <ActivityIndicator color="#fff" />
                    </View>
                )}
                {error && !loading && (
                    <View style={styles.videoOverlay}>
                        <Text style={styles.errorText}>Couldn&apos;t load this video.</Text>
                        <Pressable onPress={() => setCurrentId(id => id)} hitSlop={8}>
                            <Text style={[styles.retryText, { color: theme.brand2 }]}>Tap to retry</Text>
                        </Pressable>
                    </View>
                )}
            </View>

            {/* Meta */}
            {!!position && (
                <Text style={[styles.position, { color: theme.ink3 }]}>{position}</Text>
            )}
            <Text style={[styles.title, { color: theme.ink }]} numberOfLines={2}>
                {currentTitle}
            </Text>

            {/* Previous / Next */}
            <View style={styles.navRow}>
                <Pressable
                    onPress={goPrev}
                    disabled={!hasPrev}
                    style={({ pressed }) => [
                        styles.navBtn,
                        { backgroundColor: theme.surface, borderColor: theme.ink },
                        !hasPrev && { opacity: 0.4 },
                        pressed && hasPrev && { transform: [{ scale: 0.97 }] },
                    ]}
                >
                    <IconChevronLeft size={16} color={theme.ink} />
                    <Text style={[styles.navText, { color: theme.ink }]}>Previous</Text>
                </Pressable>

                <Pressable
                    onPress={goNext}
                    disabled={!hasNext}
                    style={({ pressed }) => [
                        styles.navBtn,
                        { backgroundColor: theme.brand, borderColor: theme.ink },
                        !hasNext && { opacity: 0.4 },
                        pressed && hasNext && { transform: [{ scale: 0.97 }] },
                    ]}
                >
                    <Text style={[styles.navText, { color: theme.onBrand }]}>Next</Text>
                    <IconChevronRight size={16} color={theme.onBrand} />
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 54,
        paddingHorizontal: 20,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
        alignSelf: 'flex-start',
    },
    videoWrap: {
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000',
        justifyContent: 'center',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    videoOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    errorText: {
        color: '#fff',
        fontFamily: 'Geist-Regular',
        fontSize: 14,
    },
    retryText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 14,
    },
    position: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        marginTop: 20,
        marginBottom: 6,
    },
    title: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 26,
        lineHeight: 30,
        letterSpacing: -0.3,
        marginBottom: 24,
    },
    navRow: {
        flexDirection: 'row',
        gap: 12,
    },
    navBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1.5,
    },
    navText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 14,
    },
});
