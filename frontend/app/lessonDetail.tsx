import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { LESSONS } from '../constants/lessons';
import Button from '../components/ui/Button';

const STORAGE_KEY = 'completed_lessons';
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

export default function LessonDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { theme } = useTheme();

    const lesson = LESSONS.find(l => l.id === Number(id));

    const handleComplete = async () => {
        if (!lesson) return;
        try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            const ids: number[] = raw ? JSON.parse(raw) : [];
            if (!ids.includes(lesson.id)) {
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, lesson.id]));
            }
        } catch (e) {
            console.error('Error saving completion:', e);
        }
        router.back();
    };

    const styles = makeStyles(theme);

    if (!lesson) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Lesson not found.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Back button */}
            <Pressable onPress={() => router.back()} style={styles.backRow}>
                <Text style={styles.backChevron}>‹</Text>
                <Text style={styles.backLabel}>Back</Text>
            </Pressable>

            {/* Title */}
            <Text style={styles.title}>{lesson.title}</Text>

            {/* Passage */}
            <View style={styles.passageBlock}>
                <Text style={styles.passageText}>{lesson.passage}</Text>
                <Text style={styles.passageRef}>{lesson.passageRef}</Text>
            </View>

            {/* Sections */}
            {lesson.sections.map((section, i) => (
                <View key={i} style={styles.section}>
                    <Text style={styles.sectionHeading}>{section.heading}</Text>
                    <Text style={styles.sectionBody}>{section.body}</Text>
                </View>
            ))}

            {/* Prayer */}
            <View style={styles.prayerBlock}>
                <Text style={styles.prayerHeading}>Prayer</Text>
                <Text style={styles.prayerText}>{lesson.prayer}</Text>
            </View>

            {/* Complete button */}
            <View style={styles.completeRow}>
                <Button
                    label="Mark as Complete"
                    onPress={handleComplete}
                    variant="success"
                    size="lg"
                    fullWidth
                />
            </View>
        </ScrollView>
    );
}

const makeStyles = (theme: ReturnType<typeof import('../context/ThemeContext').useTheme>['theme']) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        content: {
            padding: 20,
            paddingBottom: 48,
        },
        errorText: {
            color: theme.text,
            padding: 20,
        },
        backRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 16,
            marginBottom: 24,
            gap: 4,
        },
        backChevron: {
            fontSize: 26,
            color: theme.action,
            lineHeight: 28,
        },
        backLabel: {
            fontSize: 16,
            color: theme.action,
            fontWeight: '500',
        },
        title: {
            fontSize: 22,
            fontWeight: '700',
            color: theme.text,
            textAlign: 'left',
            marginBottom: 24,
        },
        passageBlock: {
            backgroundColor: theme.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 20,
            marginBottom: 28,
            alignItems: 'center',
        },
        passageText: {
            fontFamily: SERIF,
            fontSize: 17,
            fontStyle: 'italic',
            color: theme.text,
            textAlign: 'center',
            lineHeight: 28,
            marginBottom: 10,
        },
        passageRef: {
            fontFamily: SERIF,
            fontSize: 14,
            color: theme.textSecondary,
            textAlign: 'center',
        },
        section: {
            marginBottom: 24,
        },
        sectionHeading: {
            fontSize: 15,
            fontWeight: '700',
            color: theme.text,
            textAlign: 'left',
            marginBottom: 8,
        },
        sectionBody: {
            fontSize: 15,
            color: theme.textSecondary,
            textAlign: 'left',
            lineHeight: 24,
        },
        prayerBlock: {
            marginTop: 4,
            marginBottom: 32,
        },
        prayerHeading: {
            fontSize: 15,
            fontWeight: '700',
            color: theme.text,
            textAlign: 'left',
            marginBottom: 12,
        },
        prayerText: {
            fontFamily: SERIF,
            fontSize: 16,
            fontStyle: 'italic',
            color: theme.textSecondary,
            textAlign: 'center',
            lineHeight: 26,
        },
        completeRow: {
            marginTop: 8,
        },
    });
