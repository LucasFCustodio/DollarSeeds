/**
 * ExpenseContainer — visual revamp (DollarSeeds design system)
 *
 * Behaviour preserved:
 * ✅ POST to /expenses/ with title, amount, category, day, month, user_id
 * ✅ Success flash resets form
 * ✅ Category + sub-category drive form context
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
import {
    IconNeeds, IconWants, IconGoals,
    IconChevronLeft, IconCheck,
} from '../icons';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];
const MONTH_ABBRS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const SUBCATS = {
    needs: ['Rent', 'Groceries', 'Utilities', 'Transit', 'Insurance', 'Healthcare', 'Other'],
    wants: ['Dining', 'Coffee', 'Streaming', 'Shopping', 'Travel', 'Gifts', 'Other'],
    goals: ['Emergency', 'Retirement', 'Loan', 'Investing', 'Tithe', 'Other'],
};

// Maps UI keys → backend category strings (aligns with /expenses/details/ params)
const CAT_API = { needs: 'Needs', wants: 'Wants', goals: 'Goals' };

// ─── Component ────────────────────────────────────────────────────────────────
export default function ExpenseContainer() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme } = useTheme();

    const today = new Date();
    const dateStr = `${MONTH_ABBRS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

    // Form state
    const [amount, setAmount]     = useState('');
    const [category, setCategory] = useState('needs');
    const [subcat, setSubcat]     = useState('Groceries');
    const [note, setNote]         = useState('');
    const [submitted, setSubmitted] = useState(false);

    const cats = [
        { key: 'needs', label: 'Needs', Icon: IconNeeds, color: theme.needs, soft: theme.needsSoft },
        { key: 'wants', label: 'Wants', Icon: IconWants, color: theme.wants, soft: theme.wantsSoft },
        { key: 'goals', label: 'Goals', Icon: IconGoals, color: theme.goals, soft: theme.goalsSoft },
    ];
    const selected = cats.find(c => c.key === category);

    // ── Submit ─────────────────────────────────────────────────────────────────
    const submitExpense = async () => {
        const parsed = parseFloat(amount);
        if (!amount || isNaN(parsed) || parsed <= 0) return;
        try {
            await axios.post('http://10.0.0.13:8000/expenses/', {
                title: note.trim() || subcat,
                sub_category: subcat,
                note: note.trim() || null,
                amount: parsed,
                category: CAT_API[category],
                day: today.getDate(),
                month: MONTHS[today.getMonth()],
                user_id: user?.id,
            });
            setAmount('');
            setNote('');
            setSubcat(SUBCATS[category][0]);
            setSubmitted(true);
            setTimeout(() => setSubmitted(false), 2000);
        } catch (err) {
            console.error('Expense submit error:', err?.message ?? err);
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
                    <Text style={[styles.screenTitle, { color: theme.ink }]}>New Expense</Text>
                    <Text style={[styles.screenSubtitle, { color: theme.ink3 }]}>Plant where it counts</Text>
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
                    <View
                        pointerEvents="none"
                        style={styles.leafFlourishWrap}
                    >
                        <Svg viewBox="0 0 200 200" width={200} height={200}>
                            <Path
                                d="M100 20c-30 30-60 60-60 100s30 60 60 60 60-30 60-60-30-70-60-100z"
                                fill="rgba(255,255,255,0.13)"
                            />
                        </Svg>
                    </View>

                    <View style={styles.amountInner}>
                        <Text style={styles.amountEyebrow}>AMOUNT</Text>
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
                        <Text style={styles.amountDate}>{dateStr}</Text>
                    </View>
                </LinearGradient>

                {/* ── Category ────────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>CATEGORY</Text>
                <View style={styles.catGrid}>
                    {cats.map(c => {
                        const active = category === c.key;
                        return (
                            <Pressable
                                key={c.key}
                                onPress={() => {
                                    setCategory(c.key);
                                    setSubcat(SUBCATS[c.key][0]);
                                }}
                                style={({ pressed }) => [
                                    styles.catCard,
                                    {
                                        backgroundColor: active ? c.soft : theme.surface,
                                        borderColor: active ? c.color : theme.border,
                                        ...(active ? shadow(4) : {}),
                                    },
                                    active && styles.catCardActive,
                                    pressed && { opacity: 0.85 },
                                ]}
                            >
                                <View style={[
                                    styles.catIconTile,
                                    { backgroundColor: active ? c.soft : theme.surfaceSoft },
                                ]}>
                                    <c.Icon size={26} accent={c.color} />
                                </View>
                                <Text style={[
                                    styles.catLabel,
                                    { color: active ? c.color : theme.ink2 },
                                ]}>
                                    {c.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* ── Sub-category chips ───────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>SUB-CATEGORY</Text>
                <View style={styles.chipsWrap}>
                    {SUBCATS[category].map(s => {
                        const active = subcat === s;
                        return (
                            <Pressable
                                key={s}
                                onPress={() => setSubcat(s)}
                                style={({ pressed }) => [
                                    styles.chip,
                                    {
                                        backgroundColor: active ? selected.color : theme.surface,
                                        borderColor: active ? selected.color : theme.border,
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

                {/* ── Note ────────────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>NOTE (OPTIONAL)</Text>
                <TextInput
                    style={[
                        styles.noteInput,
                        {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            color: theme.ink,
                        },
                    ]}
                    placeholder="Trader Joe's haul"
                    placeholderTextColor={theme.ink3}
                    value={note}
                    onChangeText={setNote}
                    maxLength={40}
                />

                {/* ── Submit ──────────────────────────────────────────── */}
                <Pressable
                    onPress={submitExpense}
                    style={({ pressed }) => [
                        styles.submitBtn,
                        {
                            backgroundColor: submitted ? theme.success : selected.color,
                            ...shadow(5),
                        },
                        pressed && { transform: [{ scale: 0.97 }] },
                    ]}
                >
                    <Text style={styles.submitText}>
                        {submitted ? 'Planted!' : 'Plant Expense'}
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
        paddingVertical: 28,
        paddingHorizontal: 24,
        marginBottom: 22,
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
        fontSize: 64,
        lineHeight: 72,
        color: '#fff',
        letterSpacing: -1,
        minWidth: 80,
        textAlign: 'center',
        padding: 0,
        ...Platform.select({
            android: { includeFontPadding: false },
        }),
    },
    amountDate: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 8,
        letterSpacing: 0.4,
    },

    // Category grid
    sectionLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 10,
        letterSpacing: 1.6,
        marginBottom: 10,
        marginTop: 4,
    },
    catGrid: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 22,
    },
    catCard: {
        flex: 1,
        borderRadius: 16,
        borderWidth: 1.5,
        paddingVertical: 14,
        paddingHorizontal: 8,
        alignItems: 'center',
        gap: 6,
    },
    catCardActive: {
        transform: [{ translateY: -2 }],
    },
    catIconTile: {
        width: 42,
        height: 42,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    catLabel: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 12,
        letterSpacing: -0.1,
    },

    // Sub-category chips
    chipsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 22,
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

    // Note input
    noteInput: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 14,
        fontFamily: 'Geist-Regular',
        marginBottom: 22,
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
