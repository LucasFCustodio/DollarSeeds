/**
 * ConnectBankPrompt — one line under the logging area inviting the user to connect a
 * bank. Free users go to the paywall; premium users get a "coming soon" note until
 * Plaid exists. Never shown once a bank is connected, and not while the premium
 * kill switch is off (a paywall that cannot sell anything is a dead end).
 */
import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { homeType } from './homeType';

export default function ConnectBankPrompt({ connected }: { connected: boolean }) {
    const { theme } = useTheme();
    const { t } = useTranslation('dashboard');
    const { premiumActive, config, openPaywall } = useSubscription();

    if (connected || !config.premiumEnabled) return null;

    const onPress = () => {
        if (!premiumActive) openPaywall();
        else Alert.alert(t('connectBank.soonTitle'), t('connectBank.soonBody'));
    };

    return (
        <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={[homeType.verySmallEmphasis, { color: theme.harvestInk }]}>{t('connectBank.prompt')}</Text>
        </Pressable>
    );
}
