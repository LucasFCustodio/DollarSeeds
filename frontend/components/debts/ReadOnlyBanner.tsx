/**
 * ReadOnlyBanner — the slim strip over the garden and the debt detail when the
 * `debt_freedom` allowance is `read_only` (a lapsed subscriber with debts): their
 * debts are saved and visible, and Subscribe opens the paywall.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';

export default function ReadOnlyBanner() {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const { openPaywall } = useSubscription();
    return (
        <View style={[styles.banner, { backgroundColor: theme.harvestSoft, borderColor: theme.ink }]}>
            <Text style={[styles.text, { color: theme.ink, fontFamily: Fonts.sansSemiBold }]}>
                {t('readOnly.banner')}
            </Text>
            <Pressable
                onPress={openPaywall}
                accessibilityRole="button"
                accessibilityLabel={t('readOnly.subscribeA11y')}
                hitSlop={6}
                style={({ pressed }) => [styles.button, { backgroundColor: theme.brand, opacity: pressed ? 0.8 : 1 }]}
            >
                <Text style={[styles.buttonText, { color: theme.onBrand, fontFamily: Fonts.sansSemiBold }]}>
                    {t('readOnly.subscribe')}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16,
        paddingVertical: 8, paddingLeft: 14, paddingRight: 8, borderRadius: 14, borderWidth: 1,
    },
    text: { flex: 1, fontSize: 13, lineHeight: 18 },
    button: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
    buttonText: { fontSize: 13 },
});
