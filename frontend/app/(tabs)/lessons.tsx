/**
 * LessonsScreen — visual revamp (DollarSeeds design system)
 *
 * Behaviour preserved:
 * ✅ Completed lesson IDs stored in AsyncStorage
 * ✅ Star ratings stored locally; user prompted to share with backend
 * ✅ Tap card → lessonDetail screen
 * ✅ Progress bar reflects completed / total
 */
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import AnimatedProgressBar from '../../components/ui/AnimatedProgressBar';
import Card from '../../components/ui/Card';
import { IconCheck, IconScripture, IconStar } from '../../components/icons';
import { LESSONS } from '../../constants/lessons';

const BASE = 'https://dollarseeds-1.onrender.com';
const STORAGE_KEY = 'completed_lessons';

export default function LessonsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme } = useTheme();

    const [completedIds, setCompletedIds] = useState<number[]>([]);
    const [ratings, setRatings] = useState<Record<number, number>>({});

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

                {/* Progress strip */}
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

            {/* ── Lesson cards ────────────────────────────────────── */}
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
                            onPress={() =>
                                router.push({
                                    pathname: '/lessonDetail',
                                    params: { id: lesson.id },
                                } as any)
                            }
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
        fontSize: 36,
        letterSpacing: -0.5,
        lineHeight: 38,
        marginBottom: 10,
    },
    subtitle: {
        fontFamily: 'Geist-Regular',
        fontSize: 13,
        lineHeight: 19,
        maxWidth: 280,
        marginBottom: 18,
    },

    // Progress
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    progressLabel: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        marginTop: 6,
    },
    progressBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    progressBadgeText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 12,
    },

    // Card list
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
        fontSize: 18,
        lineHeight: 22,
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
        fontSize: 15,
        letterSpacing: -0.1,
        flex: 1,
    },
    minutesLabel: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        flexShrink: 0,
        marginTop: 1,
    },
    lessonDesc: {
        fontFamily: 'Geist-Regular',
        fontSize: 13,
        lineHeight: 19,
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
        fontSize: 11,
    },
    starsRow: {
        flexDirection: 'row',
        gap: 2,
    },
});
