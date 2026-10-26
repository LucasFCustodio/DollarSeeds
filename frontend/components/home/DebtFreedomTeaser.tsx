/**
 * DebtFreedomTeaser — the Analyze band's card for a user without Debt Freedom (the
 * `debt_freedom` allowance is `none` or `read_only`), where NextPaymentCard sits for
 * a subscriber. Painted the same way, with the same outline. "Learn how" opens the
 * Debts tab, which shows the tutorial (or the read-only garden).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { ft } from '../../constants/responsive';
import PaintedCard from './PaintedCard';
import { homeType } from './homeType';

export default function DebtFreedomTeaser({ onLearn }: { onLearn: () => void }) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    return (
        <PaintedCard source={ART} borderColor={theme.ink} borderWidth={1.5} style={styles.card}>
            <View style={styles.row}>
                <View style={styles.left}>
                    <Text style={[homeType.small, { color: theme.ink2 }]} numberOfLines={1}>
                        {t('debtTeaser.eyebrow')}
                    </Text>
                    {/* Two lines at most beside the button: the copy fits in two at
                        375 pt in both languages; a larger system text size shrinks
                        it a little rather than adding a third. */}
                    <Text style={[homeType.medium, styles.line, { color: theme.ink }]}
                        numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {t('debtTeaser.line')}
                    </Text>
                </View>
                <Pressable
                    onPress={onLearn}
                    accessibilityRole="button"
                    accessibilityLabel={t('debtTeaser.ctaA11y')}
                    style={({ pressed }) => [styles.cta, { backgroundColor: theme.brand }, pressed && { opacity: 0.8 }]}
                >
                    <Text style={[styles.ctaText, { color: theme.onBrand }]}>{t('debtTeaser.cta')}</Text>
                </Pressable>
            </View>
        </PaintedCard>
    );
}

// NextPaymentCard's art: the teaser stands in its place.
const ART = require('../../assets/images/home/next-payment-bg.png');

const styles = StyleSheet.create({
    card: { padding: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    left: { flex: 1 },
    line: { marginTop: 4 },
    cta: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    ctaText: { fontFamily: Fonts.sansSemiBold, fontSize: ft(13) },
});
