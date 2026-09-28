import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { IconChevronLeft } from '../icons';

/** Back chevron + eyebrow + title, the same shape as the Settings header. */
export default function BackHeader({ eyebrow, title, backLabel }: { eyebrow?: string; title: string; backLabel: string }) {
    const { theme } = useTheme();
    const router = useRouter();
    return (
        <View style={styles.row}>
            <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel={backLabel}
                hitSlop={8}
                style={({ pressed }) => [styles.back, { backgroundColor: theme.surface, borderColor: theme.ink }, pressed && { opacity: 0.7 }]}
            >
                <IconChevronLeft size={18} color={theme.ink} />
            </Pressable>
            <View style={styles.text}>
                {eyebrow ? (
                    <Text style={[styles.eyebrow, { color: theme.ink3, fontFamily: Fonts.monoSemiBold }]}>{eyebrow}</Text>
                ) : null}
                <Text numberOfLines={1} style={[styles.title, { color: theme.ink, fontFamily: Fonts.serif }]}>{title}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 10 },
    back: { width: 38, height: 38, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1 },
    eyebrow: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
    title: { fontSize: 28 },
});
