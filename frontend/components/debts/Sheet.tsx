/**
 * Sheet — the bottom-sheet shell every Debts sheet shares (extra payment, statement
 * check-in, late fee, plan settings): backdrop, grabber, title and subtitle.
 */
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, shadow, useTheme } from '../../context/ThemeContext';

interface Props {
    visible: boolean;
    onClose: () => void;
    /** Accessibility label for the backdrop, which closes the sheet. */
    closeLabel: string;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}

export default function Sheet({ visible, onClose, closeLabel, title, subtitle, children }: Props) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
                {visible ? (
                    <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.ink, paddingBottom: 20 + insets.bottom, ...(shadow(10) as object) }]}>
                        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
                        <Text style={[styles.title, { color: theme.ink, fontFamily: Fonts.serif }]}>{title}</Text>
                        {subtitle ? (
                            <Text style={[styles.sub, { color: theme.ink2, fontFamily: Fonts.sansSemiBold }]}>{subtitle}</Text>
                        ) : <View style={styles.gap} />}
                        {children}
                    </View>
                ) : null}
            </KeyboardAvoidingView>
        </Modal>
    );
}

export const sheetStyles = StyleSheet.create({
    hint: { fontSize: 12, marginTop: -2 },
    body: { fontSize: 15, lineHeight: 21, marginBottom: 12 },
    error: { fontSize: 13, marginTop: 10 },
    buttons: { gap: 6, marginTop: 16 },
});

const styles = StyleSheet.create({
    fill: { flex: 1 },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1.5, borderBottomWidth: 0, paddingHorizontal: 20, paddingTop: 10 },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, marginBottom: 12 },
    title: { fontSize: 28 },
    sub: { fontSize: 14, marginBottom: 14 },
    gap: { height: 10 },
});
