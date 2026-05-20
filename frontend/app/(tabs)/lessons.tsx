import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import React, { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LESSONS } from '../../constants/lessons';

const BASE = 'http://10.0.0.13:8000';
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
        }, [])
    );

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
            ]
        );
    };

    const styles = makeStyles(theme);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.header}>Lessons</Text>
            <Text style={styles.subheader}>What does the Bible say about money?</Text>

            {LESSONS.map(lesson => {
                const rating = ratings[lesson.id] ?? 0;
                const completed = completedIds.includes(lesson.id);

                return (
                    <Pressable
                        key={lesson.id}
                        onPress={() => router.push({ pathname: '/lessonDetail', params: { id: lesson.id } } as any)}
                        style={({ pressed }) => [styles.card, { opacity: pressed ? 0.92 : 1 }]}
                    >
                        <View style={styles.cardInner}>
                            <Text style={styles.lessonTitle}>{lesson.title}</Text>
                            <Text style={styles.lessonDesc}>{lesson.description}</Text>

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
                                        <Text style={[styles.star, { color: star <= rating ? theme.goals : theme.border }]}>
                                            ★
                                        </Text>
                                    </Pressable>
                                ))}
                                {rating > 0 && (
                                    <Text style={styles.ratingLabel}>{rating}/5</Text>
                                )}
                            </View>
                        </View>

                        {completed && <View style={styles.completedBar} />}
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

const makeStyles = (theme: ReturnType<typeof import('../../context/ThemeContext').useTheme>['theme']) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        content: {
            padding: 20,
            paddingBottom: 40,
        },
        header: {
            fontSize: 28,
            fontWeight: '700',
            color: theme.text,
            marginTop: 16,
            marginBottom: 4,
        },
        subheader: {
            fontSize: 14,
            color: theme.textSecondary,
            marginBottom: 24,
        },
        card: {
            backgroundColor: theme.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 16,
            overflow: 'hidden',
        },
        cardInner: {
            padding: 18,
        },
        lessonTitle: {
            fontSize: 17,
            fontWeight: '700',
            color: theme.text,
            marginBottom: 6,
        },
        lessonDesc: {
            fontSize: 14,
            color: theme.textSecondary,
            lineHeight: 20,
            marginBottom: 14,
        },
        starsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        star: {
            fontSize: 26,
        },
        ratingLabel: {
            fontSize: 13,
            color: theme.textMuted,
            marginLeft: 6,
        },
        completedBar: {
            height: 3,
            backgroundColor: '#10B981',
        },
    });
