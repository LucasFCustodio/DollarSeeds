/**
 * LessonDetailScreen — visual revamp (DollarSeeds design system)
 *
 * Behaviour preserved:
 * ✅ Marks lesson as completed in AsyncStorage on "Mark as Complete"
 * ✅ Navigates back after completion
 * ✅ Back chevron returns to lessons list
 */
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import i18n from '../lib/i18n';

import { useTheme, shadow } from '../context/ThemeContext';
import { useAnalytics } from '../lib/analytics';
import { IconChevronLeft, IconCheck, IconScripture } from '../components/icons';
import Card from '../components/ui/Card';
import { findLesson } from '../constants/lessons';

const STORAGE_KEY = 'completed_lessons';

export default function LessonDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { theme } = useTheme();
    const { t } = useTranslation('lessons');
    const analytics = useAnalytics();

    const lesson = findLesson(id);
    // Every string below is keyed off the lesson's catalogue path.
    const lk = (path: string) => t(`written.${lesson?.key}.${path}`);

    const handleComplete = async () => {
        if (!lesson) return;
        try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            const ids: number[] = raw ? JSON.parse(raw) : [];
            if (!ids.includes(lesson.id)) {
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, lesson.id]));
            }
            analytics.writtenLessonCompleted({
                lesson_id: lesson.id,
                // English title on purpose: an event split by translated title reads
                // as two different lessons in the analytics dashboard.
                title: i18n.getFixedT('en', 'lessons')(`written.${lesson.key}.title`),
            });
        } catch (e) {
            console.error('Error saving completion:', e);
        }
        router.back();
    };

    if (!lesson) {
        return (
            <View style={[styles.errorWrap, { backgroundColor: theme.bg }]}>
                <Text style={[styles.errorText, { color: theme.ink }]}>{t('detail.notFound')}</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Back button ─────────────────────────────────────── */}
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

            {/* ── Title ───────────────────────────────────────────── */}
            <Text style={[styles.title, { color: theme.ink }]}>{lk('title')}</Text>

            {/* ── Scripture card ──────────────────────────────────── */}
            <Card theme={theme} depth={4} padding={24} style={styles.passageCard}>
                {/* Quote mark flourish */}
                <Text style={[styles.quoteMarkTop, { color: theme.brand }]}>{'“'}</Text>

                <Text style={[styles.passageText, { color: theme.ink }]}>
                    {lk('passage')}
                </Text>

                {/* Reference badge */}
                <View style={[styles.refBadge, { backgroundColor: theme.surfaceSoft }]}>
                    <IconScripture size={13} color={theme.brand} />
                    <Text style={[styles.refText, { color: theme.brand }]}>
                        {lk('passageRef')}
                    </Text>
                </View>
            </Card>

            {/* ── Sections ────────────────────────────────────────── */}
            {Array.from({ length: lesson.sectionCount }, (_, i) => i).map(i => (
                <View key={i} style={styles.section}>
                    <Text style={[styles.sectionHeading, { color: theme.ink }]}>
                        {lk(`sections.${i}.heading`)}
                    </Text>
                    <Text style={[styles.sectionBody, { color: theme.ink2 }]}>
                        {lk(`sections.${i}.body`)}
                    </Text>
                </View>
            ))}

            {/* ── Prayer ──────────────────────────────────────────── */}
            <Card theme={theme} depth={3} padding={22} style={styles.prayerCard}>
                <Text style={[styles.prayerHeading, { color: theme.ink3 }]}>{t('detail.prayer')}</Text>
                <Text style={[styles.prayerText, { color: theme.ink }]}>
                    {lk('prayer')}
                </Text>
            </Card>

            {/* ── Complete button ─────────────────────────────────── */}
            <Pressable
                onPress={handleComplete}
                style={({ pressed }) => [
                    styles.completeBtn,
                    { backgroundColor: theme.success, ...(shadow(5) as object) },
                    pressed && { transform: [{ scale: 0.97 }] },
                ]}
            >
                <IconCheck size={16} color="#fff" />
                <Text style={styles.completeBtnText}>{t('detail.complete')}</Text>
            </Pressable>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 20,
        paddingTop: 54,
        paddingBottom: 56,
    },
    errorWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorText: {
        fontFamily: 'Geist-Regular',
        fontSize: 15,
    },

    // Back button
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

    // Title
    title: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 30,
        letterSpacing: -0.5,
        lineHeight: 34,
        marginBottom: 22,
    },

    // Passage card
    passageCard: {
        marginBottom: 28,
        alignItems: 'center',
    },
    quoteMarkTop: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 72,
        lineHeight: 48,
        marginBottom: 4,
        alignSelf: 'flex-start',
    },
    passageText: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: 17,
        lineHeight: 27,
        textAlign: 'center',
        marginBottom: 18,
    },
    refBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    refText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 12,
    },

    // Sections
    section: {
        marginBottom: 26,
    },
    sectionHeading: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 16,
        letterSpacing: -0.1,
        marginBottom: 10,
    },
    sectionBody: {
        fontFamily: 'Geist-Regular',
        fontSize: 15,
        lineHeight: 24,
    },

    // Prayer card
    prayerCard: {
        marginBottom: 28,
    },
    prayerHeading: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 10,
        letterSpacing: 1.6,
        marginBottom: 12,
    },
    prayerText: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: 16,
        lineHeight: 26,
        textAlign: 'center',
    },

    // Complete button
    completeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 14,
    },
    completeBtnText: {
        color: '#fff',
        fontFamily: 'Geist-SemiBold',
        fontSize: 15,
    },
});
