/**
 * ScriptureModal — the per-month "all green" celebration. Fires once per month when
 * every split is within budget (the home decides when; this only draws it).
 *
 * Only the verse IDs live here; text and reference come from `dashboard:verse.<id>`.
 * pt-BR uses João Ferreira de Almeida (public domain) — the English is NIV/NLT
 * wording, so these are the SAME passages, not string-for-string translations.
 */
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { IconScripture } from '../icons';

export const VERSE_IDS = [
    'proverbs-21-20',
    'luke-16-10',
    'proverbs-13-11',
    'proverbs-3-9',
    'deuteronomy-8-18',
    'matthew-6-33',
    'philippians-4-19',
    'proverbs-22-7',
    'leviticus-27-30',
    'deuteronomy-16-17',
    'proverbs-11-24',
    'hebrews-13-16',
    '2corinthians-8-12',
    'matthew-6-3',
    'luke-6-38',
] as const;

export type VerseId = (typeof VERSE_IDS)[number];

export const randomVerse = (): VerseId => VERSE_IDS[Math.floor(Math.random() * VERSE_IDS.length)];

export default function ScriptureModal({ verse, visible, onClose }: {
    verse: VerseId;
    visible: boolean;
    onClose: () => void;
}) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Card theme={theme} depth={8} style={styles.card}>
                    <View style={[styles.tile, { backgroundColor: theme.brandSoft }]}>
                        <IconScripture size={28} color={theme.brand} />
                    </View>
                    <Text style={[styles.title, { color: theme.ink }]}>{t('scripture.modalTitle')}</Text>
                    <Text style={[styles.verse, { color: theme.ink2 }]}>
                        {t('scripture.quoted', { text: t(`verse.${verse}.text`) })}
                    </Text>
                    <Text style={[styles.ref, { color: theme.ink3 }]}>— {t(`verse.${verse}.ref`)}</Text>
                    <Button label={t('scripture.amen')} variant="primary" size="lg" fullWidth color={theme.brand} onPress={onClose} />
                </Card>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 28 },
    card: { width: '100%', alignItems: 'center', gap: 8 },
    tile: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    title: { fontFamily: Fonts.serif, fontSize: ft(22, 1.3), textAlign: 'center' },
    verse: { fontFamily: Fonts.serifItalic, fontSize: ft(15, 1.2), textAlign: 'center', lineHeight: ft(22, 1.2) },
    ref: { fontFamily: Fonts.mono, fontSize: ft(12, 1.18), letterSpacing: 0.4, marginBottom: 8 },
});
