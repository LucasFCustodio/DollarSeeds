/**
 * BennyHint — the home's ONE-TIME nudge after the onboarding (ONBOARDING_REWORK.md
 * screen 21): a small Benny, pointing, above the Needs and Wants + buttons.
 *
 * The onboarding's last screen sets `home_plus_hint_<userId>` to 'pending'; this
 * shows while it is, and "Got it" (or tapping a +) sets it to 'seen' for good.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fonts, useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { ft } from '../../constants/responsive';
import { getFlag, homeHintKey, setFlag } from '../../lib/onboardingStore';
import { BennyImage } from '../onboarding/Benny';
import Card from '../ui/Card';

export function useBennyHint() {
    const { user } = useAuth();
    const [show, setShow] = useState(false);
    useEffect(() => {
        if (!user?.id) { setShow(false); return; }
        let live = true;
        getFlag(homeHintKey(user.id)).then(v => { if (live) setShow(v === 'pending'); });
        return () => { live = false; };
    }, [user?.id]);
    const dismiss = useCallback(() => {
        setShow(false);
        if (user?.id) setFlag(homeHintKey(user.id), 'seen');
    }, [user?.id]);
    return { show, dismiss };
}

export default function BennyHint({ onDismiss }: { onDismiss: () => void }) {
    const { theme } = useTheme();
    const { t } = useTranslation('onboarding');
    return (
        <Card theme={theme} depth={4} padding={10} style={[styles.card, { borderColor: theme.brand2 }]}>
            <View style={styles.row}>
                <BennyImage pose="pointing" size={56} />
                <Text style={[styles.text, { color: theme.ink }]}>{t('homeHint.text')}</Text>
                <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
                    <Text style={[styles.dismiss, { color: theme.brand }]}>{t('homeHint.dismiss')}</Text>
                </Pressable>
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { borderWidth: 1.5 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    text: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: ft(14), lineHeight: ft(19) },
    dismiss: { fontFamily: Fonts.sansSemiBold, fontSize: ft(14) },
});
