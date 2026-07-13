/**
 * StartingBalanceGate — mandatory one-time capture of the savings a new user already
 * had BEFORE they started using DollarSeeds.
 *
 * Runs right after the guided tour finishes or is skipped (it waits for the tour to go
 * inactive), for new accounts only — beta accounts created before ONBOARDING_RELEASE_DATE
 * are never prompted, using the same isNewAccount check the tour uses. There is no skip
 * or backdrop dismiss: the modal stays until the balance is submitted, so quitting the
 * app mid-flow just brings it back on next launch.
 *
 * The amount is posted to /savings/starting-balance/, which books it into General Savings
 * with source='opening' — deliberately NOT source='income', so pre-app money never
 * consumes this month's Goals budget.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, Modal, StyleSheet, ActivityIndicator, Pressable,
    Keyboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { useTheme, shadow, Fonts } from '../../context/ThemeContext';
import { isNewAccount, startingBalanceKey } from '../../constants/onboarding';
import Button from '../ui/Button';
import InputField from '../ui/InputField';

const BASE = 'https://dollarseeds-1.onrender.com';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export default function StartingBalanceGate() {
    const { user, initialized } = useAuth();
    const { active } = useOnboarding();
    const { theme } = useTheme();
    const segments = useSegments();

    const currentMonth = MONTHS[new Date().getMonth()];
    const inAuthGroup = segments[0] === 'auth';

    // null = not checked yet for this user; true = still owes us a starting balance.
    const [needsBalance, setNeedsBalance] = useState<boolean | null>(null);
    const [amount, setAmount] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [keyboardUp, setKeyboardUp] = useState(false);

    // Drives the "Done" affordance — the numeric keypad has no return key of its own.
    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    // Decide once per signed-in user whether the gate is owed.
    useEffect(() => {
        if (!initialized || !user?.id) {
            setNeedsBalance(null);
            return;
        }
        if (!isNewAccount(user.created_at)) {
            setNeedsBalance(false);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const done = await AsyncStorage.getItem(startingBalanceKey(user.id));
                if (!cancelled) setNeedsBalance(!done);
            } catch (err) {
                console.error('Starting balance flag read error:', err);
                if (!cancelled) setNeedsBalance(false);
            }
        })();

        return () => { cancelled = true; };
    }, [initialized, user?.id, user?.created_at]);

    const parsed = parseFloat(amount);
    const valid = !!amount && !isNaN(parsed) && parsed >= 0;

    const submit = useCallback(async () => {
        if (!user?.id || !valid) return;
        setSaving(true);
        setError(null);
        try {
            await axios.post(`${BASE}/savings/starting-balance/`, {
                user_id: user.id,
                amount: parsed,
                day: 1,
                month: currentMonth,
            });
            // Also covers { already_set: true } — either way the balance exists now.
            await AsyncStorage.setItem(startingBalanceKey(user.id), 'true');
            setNeedsBalance(false);
        } catch (err) {
            console.error('Starting balance save error:', err);
            setError("Couldn't save your starting balance. Please try again.");
        } finally {
            setSaving(false);
        }
    }, [user?.id, valid, parsed, currentMonth]);

    // Wait for the tour to finish/skip, and never overlay the auth screens.
    if (!needsBalance || active || inAuthGroup) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* The numeric keypad has no return key, so tapping anywhere off the input —
                    including the scrim — is what closes it. Dismisses the keyboard only;
                    the gate itself stays up (it's mandatory). */}
                <Pressable style={styles.overlay} onPress={Keyboard.dismiss}>
                <View
                    style={[
                        styles.card,
                        { backgroundColor: theme.surface, borderColor: theme.ink, ...shadow(10) },
                    ]}
                >
                    <Text style={[styles.eyebrow, { color: theme.brand }]}>ONE LAST THING</Text>

                    {confirming ? (
                        <>
                            <Text style={[styles.title, { color: theme.ink }]}>
                                Is this correct?
                            </Text>
                            <Text style={[styles.amount, { color: theme.brand }]}>
                                ${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Text>
                            <Text style={[styles.body, { color: theme.ink2 }]}>
                                This becomes your General Savings balance. You can add to it or
                                move it into a goal any time.
                            </Text>

                            {error ? (
                                <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
                            ) : null}

                            <View style={styles.confirmRow}>
                                <Button
                                    label="No"
                                    variant="outline"
                                    size="lg"
                                    color={theme.ink}
                                    disabled={saving}
                                    onPress={() => { setError(null); setConfirming(false); }}
                                />
                                {saving ? (
                                    <ActivityIndicator color={theme.brand} />
                                ) : (
                                    <Button
                                        label="Yes"
                                        variant="primary"
                                        size="lg"
                                        color={theme.onBrand}
                                        onPress={submit}
                                    />
                                )}
                            </View>
                        </>
                    ) : (
                        <>
                            <Text style={[styles.title, { color: theme.ink }]}>
                                Your starting balance
                            </Text>
                            <Text style={[styles.body, { color: theme.ink2 }]}>
                                DollarSeeds tracks your money month by month. Enter the savings you
                                had BEFORE {currentMonth} — everything you'd already put away.
                            </Text>
                            <View style={[styles.noteBox, { backgroundColor: theme.brandSoft }]}>
                                <Text style={[styles.note, { color: theme.ink }]}>
                                    Don't include any {currentMonth} income or expenses. You'll log
                                    those normally in the Transactions tab.
                                </Text>
                            </View>

                            <InputField
                                label="Starting balance"
                                icon="💰"
                                placeholder="0.00"
                                isNumeric
                                maxLength={12}
                                value={amount}
                                onChangeText={(t: string) => { setAmount(t); setError(null); }}
                            />

                            {/* Explicit way out of the keypad — the scrim tap works too, but
                                nothing on screen would tell the user that. */}
                            {keyboardUp ? (
                                <Pressable
                                    onPress={Keyboard.dismiss}
                                    hitSlop={8}
                                    style={styles.doneBtn}
                                >
                                    <Text style={[styles.doneText, { color: theme.brand }]}>Done</Text>
                                </Pressable>
                            ) : null}

                            <View style={styles.addRow}>
                                <Button
                                    label="+ Add"
                                    variant="primary"
                                    size="lg"
                                    color={theme.onBrand}
                                    fullWidth
                                    disabled={!valid}
                                    onPress={() => { Keyboard.dismiss(); setConfirming(true); }}
                                />
                            </View>
                        </>
                    )}
                </View>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        borderRadius: 22,
        borderWidth: 1.5,
        padding: 22,
    },
    eyebrow: { fontFamily: Fonts.monoSemiBold, fontSize: 11, letterSpacing: 1.6, marginBottom: 6 },
    title: { fontFamily: Fonts.serif, fontSize: 28, marginBottom: 8 },
    amount: { fontFamily: Fonts.serif, fontSize: 40, marginBottom: 10 },
    body: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 21 },
    noteBox: { marginTop: 14, padding: 12, borderRadius: 12 },
    note: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 19 },
    error: { fontFamily: Fonts.sansMedium, fontSize: 13, marginTop: 12 },
    doneBtn: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4 },
    doneText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
    addRow: { marginTop: 16 },
    confirmRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 22,
    },
});
