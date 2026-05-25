/**
 * IncomeContainer — visual revamp (DollarSeeds design system)
 *
 * Behaviour preserved:
 * ✅ POST to /income/ with amount, source, day, month, user_id
 * ✅ Success flash resets form
 * ✅ Source chip drives form context
 * ✅ 50/30/20 split preview updates live with amount
 * ✅ Back chevron returns to previous screen
 */
import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    Pressable,
    StyleSheet,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { useTheme, shadow } from '../../context/ThemeContext';
import { IconChevronLeft, IconCheck } from '../icons';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];
const MONTH_ABBRS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const SOURCES = ['Paycheck', 'Side gig', 'Gift', 'Refund', 'Bonus', 'Other'];

// ─── Component ────────────────────────────────────────────────────────────────
export default function IncomeContainer() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme } = useTheme();

    const today = new Date();
    const dateStr = `${MONTH_ABBRS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

    // Form state
    const [amount, setAmount]   = useState('');
    const [source, setSource]   = useState('Paycheck');
    const [submitted, setSubmitted] = useState(false);

    const parsedAmt = parseFloat(amount) || 0;
    const needsAmt  = parsedAmt * 0.5;
    const wantsAmt  = parsedAmt * 0.3;
    const goalsAmt  = parsedAmt * 0.2;

    const fmt = (n) =>
        n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    // ── Submit ─────────────────────────────────────────────────────────────────
    const submitIncome = async () => {
        const parsed = parseFloat(amount);
        if (!amount || isNaN(parsed) || parsed <= 0) return;
        try {
            await axios.post('http://10.0.0.13:8000/income/', {
                amount: parsed,
                source,
                day:   today.getDate(),
                month: MONTHS[today.getMonth()],
                user_id: user?.id,
            });
            setAmount('');
            setSource('Paycheck');
            setSubmitted(true);
            setTimeout(() => setSubmitted(false), 2000);
        } catch (err) {
            console.error('Income submit error:', err?.message ?? err);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={{ paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            {/* ── Header ──────────────────────────────────────────────── */}
            <View style={styles.header}>
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
                <View style={{ flex: 1 }}>
                    <Text style={[styles.screenTitle, { color: theme.ink }]}>Log Income</Text>
                    <Text style={[styles.screenSubtitle, { color: theme.ink3 }]}>Every harvest counts</Text>
                </View>
            </View>

            <View style={{ paddingHorizontal: 20 }}>

                {/* ── Amount card ─────────────────────────────────────── */}
                <LinearGradient
                    colors={[theme.brand, theme.brand2]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 1.1, y: 1 }}
                    style={[styles.amountCard, shadow(5)]}
                >
                    {/* Leaf flourish */}
                    <View pointerEvents="none" style={styles.leafFlourishWrap}>
                        <Svg viewBox="0 0 200 200" width={200} height={200}>
                            <Path
                                d="M100 20c-30 30-60 60-60 100s30 60 60 60 60-30 60-60-30-70-60-100z"
                                fill="rgba(255,255,255,0.13)"
                            />
                        </Svg>
                    </View>

                    <View style={styles.amountInner}>
                        <Text style={styles.amountEyebrow}>AMOUNT RECEIVED</Text>
                        <View style={styles.amountRow}>
                            <Text style={styles.amountDollar}>$</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="0"
                                placeholderTextColor="rgba(255,255,255,0.35)"
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectionColor="rgba(255,255,255,0.6)"
                            />
                        </View>
                        <Text style={styles.amountScripture}>
                            "Every good and perfect gift is from above"
                        </Text>
                        <Text style={styles.amountVerse}>— James 1:17</Text>
                    </View>
                </LinearGradient>

                {/* ── 50/30/20 split preview ───────────────────────────── */}
                <View style={[styles.splitCard, { backgroundColor: theme.surface, ...shadow(3) }]}>
                    <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 0, marginBottom: 12 }]}>
                        HOW IT SPLITS
                    </Text>
                    {/* Color bar */}
                    <View style={styles.splitBar}>
                        <View style={[styles.splitBarSegment, { flex: 50, backgroundColor: theme.needs }]} />
                        <View style={[styles.splitBarSegment, { flex: 30, backgroundColor: theme.wants }]} />
                        <View style={[styles.splitBarSegment, { flex: 20, backgroundColor: theme.goals }]} />
                    </View>
                    {/* Breakdown columns */}
                    <View style={styles.splitCols}>
                        <View style={styles.splitCol}>
                            <View style={styles.splitDotRow}>
                                <View style={[styles.dot, { backgroundColor: theme.needs }]} />
                                <Text style={[styles.splitPctLabel, { color: theme.ink3 }]}>50% Needs</Text>
                            </View>
                            <Text style={[styles.splitAmt, { color: theme.ink }]}>${fmt(needsAmt)}</Text>
                        </View>
                        <View style={styles.splitCol}>
                            <View style={styles.splitDotRow}>
                                <View style={[styles.dot, { backgroundColor: theme.wants }]} />
                                <Text style={[styles.splitPctLabel, { color: theme.ink3 }]}>30% Wants</Text>
                            </View>
                            <Text style={[styles.splitAmt, { color: theme.ink }]}>${fmt(wantsAmt)}</Text>
                        </View>
                        <View style={styles.splitCol}>
                            <View style={styles.splitDotRow}>
                                <View style={[styles.dot, { backgroundColor: theme.goals }]} />
                                <Text style={[styles.splitPctLabel, { color: theme.ink3 }]}>20% Goals</Text>
                            </View>
                            <Text style={[styles.splitAmt, { color: theme.ink }]}>${fmt(goalsAmt)}</Text>
                        </View>
                    </View>
                </View>

                {/* ── Source chips ─────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>SOURCE</Text>
                <View style={styles.chipsWrap}>
                    {SOURCES.map(s => {
                        const active = source === s;
                        return (
                            <Pressable
                                key={s}
                                onPress={() => setSource(s)}
                                style={({ pressed }) => [
                                    styles.chip,
                                    {
                                        backgroundColor: active ? theme.brand : theme.surface,
                                        borderColor: active ? theme.brand : theme.border,
                                    },
                                    pressed && { opacity: 0.8 },
                                ]}
                            >
                                <Text style={[
                                    styles.chipText,
                                    { color: active ? '#fff' : theme.ink2 },
                                ]}>
                                    {s}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* ── Submit ──────────────────────────────────────────── */}
                <Pressable
                    onPress={submitIncome}
                    style={({ pressed }) => [
                        styles.submitBtn,
                        {
                            backgroundColor: submitted ? theme.success : theme.brand,
                            ...shadow(5),
                        },
                        pressed && { transform: [{ scale: 0.97 }] },
                    ]}
                >
                    <Text style={styles.submitText}>
                        {submitted ? 'Harvested!' : 'Add to Harvest'}
                    </Text>
                    <IconCheck size={16} color="#fff" />
                </Pressable>

            </View>
        </ScrollView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 54,
        paddingBottom: 20,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    screenTitle: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 26,
        letterSpacing: -0.5,
        lineHeight: 30,
    },
    screenSubtitle: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: 12,
        marginTop: 2,
    },

    // Amount card
    amountCard: {
        borderRadius: 18,
        paddingTop: 24,
        paddingBottom: 28,
        paddingHorizontal: 24,
        marginBottom: 18,
        overflow: 'hidden',
        position: 'relative',
    },
    leafFlourishWrap: {
        position: 'absolute',
        right: -40,
        top: -40,
        width: 200,
        height: 200,
    },
    amountInner: {
        alignItems: 'center',
        zIndex: 1,
    },
    amountEyebrow: {
        color: 'rgba(255,255,255,0.75)',
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 11,
        letterSpacing: 1.8,
        marginBottom: 6,
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 2,
    },
    amountDollar: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 28,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 12,
    },
    amountInput: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 72,
        lineHeight: 90,
        color: '#fff',
        letterSpacing: -1,
        minWidth: 80,
        textAlign: 'center',
        paddingTop: 8,
        paddingBottom: 0,
        paddingHorizontal: 0,
        ...Platform.select({
            android: { includeFontPadding: false },
        }),
    },
    amountScripture: {
        fontFamily: 'InstrumentSerif-Italic',
        fontSize: 13,
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
        marginTop: 14,
        paddingHorizontal: 8,
        lineHeight: 19,
    },
    amountVerse: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 10,
        color: 'rgba(255,255,255,0.65)',
        marginTop: 4,
        letterSpacing: 0.3,
    },

    // Section label
    sectionLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 10,
        letterSpacing: 1.6,
        marginBottom: 10,
        marginTop: 4,
    },

    // Split card
    splitCard: {
        borderRadius: 16,
        padding: 18,
        marginBottom: 22,
    },
    splitBar: {
        flexDirection: 'row',
        height: 10,
        borderRadius: 999,
        overflow: 'hidden',
        marginBottom: 14,
        gap: 2,
    },
    splitBarSegment: {
        height: '100%',
    },
    splitCols: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    splitCol: {
        flex: 1,
    },
    splitDotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 4,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    splitPctLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 9,
        letterSpacing: 0.3,
    },
    splitAmt: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: 20,
        letterSpacing: -0.5,
    },

    // Source chips
    chipsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 24,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
    },
    chipText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 12,
    },

    // Submit button
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 14,
    },
    submitText: {
        color: '#fff',
        fontFamily: 'Geist-SemiBold',
        fontSize: 15,
    },
});
