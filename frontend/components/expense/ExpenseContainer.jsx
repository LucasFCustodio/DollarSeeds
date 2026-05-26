/**
 * ExpenseContainer — visual revamp (DollarSeeds design system)
 *
 * Behaviour preserved:
 * ✅ POST to /expenses/ with title, amount, category, day, month, user_id
 * ✅ Success flash resets form
 * ✅ Category + sub-category drive form context
 * ✅ Back chevron returns to previous screen
 */
import React, { useState, useRef, useEffect } from 'react';
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

// ─── Month picker ─────────────────────────────────────────────────────────────
const ITEM_H = 46;

function MonthPicker({ value, onChange, theme }) {
    const scrollRef = useRef(null);
    const selectedIdx = MONTHS.indexOf(value);

    // Scroll to the current month on first render (no animation)
    useEffect(() => {
        if (scrollRef.current && selectedIdx >= 0) {
            scrollRef.current.scrollTo({
                y: selectedIdx * ITEM_H,
                animated: false,
            });
        }
    }, []);

    const onScrollEnd = (e) => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
        const clamped = Math.max(0, Math.min(MONTHS.length - 1, idx));
        onChange(MONTHS[clamped]);
    };

    return (
        <View style={[
            styles.pickerWrap,
            { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
            <ScrollView
                ref={scrollRef}
                snapToInterval={ITEM_H}
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                onMomentumScrollEnd={onScrollEnd}
                style={{ backgroundColor: 'transparent' }}
            >
                {MONTHS.map((item) => {
                    const active = item === value;
                    return (
                        <Pressable
                            key={item}
                            onPress={() => {
                                const idx = MONTHS.indexOf(item);
                                scrollRef.current?.scrollTo({
                                    y: idx * ITEM_H,
                                    animated: true,
                                });
                                onChange(item);
                            }}
                            style={styles.pickerItem}
                        >
                            <Text style={[
                                styles.pickerItemText,
                                active
                                    ? { color: theme.brand, fontFamily: 'Geist-SemiBold', fontSize: 15 }
                                    : { color: theme.ink3, fontFamily: 'Geist-Regular', fontSize: 13 },
                            ]}>
                                {item}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ExpenseContainer() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme } = useTheme();

    const today = new Date();

    // Form state
    const [amount, setAmount]     = useState('');
    const [category, setCategory] = useState('needs');
    const [subcat, setSubcat]     = useState('Groceries');
    const [title, setTitle]       = useState('');
    const [month, setMonth]       = useState(MONTHS[today.getMonth()]);
    const [day, setDay]           = useState(String(today.getDate()));
    const [submitted, setSubmitted] = useState(false);

    // Live date string shown in the amount card
    const dateStr = `${MONTH_ABBRS[MONTHS.indexOf(month)] ?? MONTH_ABBRS[today.getMonth()]} ${day || today.getDate()}, ${today.getFullYear()}`;

    const cats = [
        { key: 'needs', label: 'Needs', Icon: IconNeeds, color: theme.needs, soft: theme.needsSoft },
        { key: 'wants', label: 'Wants', Icon: IconWants, color: theme.wants, soft: theme.wantsSoft },
        { key: 'goals', label: 'Goals', Icon: IconGoals, color: theme.goals, soft: theme.goalsSoft },
    ];
    const selected = cats.find(c => c.key === category);

    // ── Submit ─────────────────────────────────────────────────────────────────
    const submitExpense = async () => {
        const parsed = parseFloat(amount);
        const parsedDay = parseInt(day, 10);
        if (!amount || isNaN(parsed) || parsed <= 0) return;
        if (!month || !MONTHS.includes(month)) return;
        if (!day || isNaN(parsedDay) || parsedDay < 1 || parsedDay > 31) return;
        try {
            await axios.post('http://10.0.0.13:8000/expenses/', {
                title: title.trim() || subcat,
                sub_category: subcat,
                amount: parsed,
                category: CAT_API[category],
                day: parsedDay,
                month,
                user_id: user?.id,
            });
            setAmount('');
            setTitle('');
            setMonth(MONTHS[today.getMonth()]);
            setDay(String(today.getDate()));
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

                {/* ── Title ───────────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>TITLE (OPTIONAL)</Text>
                <TextInput
                    style={[
                        styles.fieldInput,
                        {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            color: theme.ink,
                        },
                    ]}
                    placeholder="Trader Joe's haul"
                    placeholderTextColor={theme.ink3}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={40}
                />

                {/* ── Month & Day ──────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>DATE</Text>
                <View style={styles.dateRow}>
                    <View style={{ flex: 2 }}>
                        <Text style={[styles.dateFieldLabel, { color: theme.ink3 }]}>Month</Text>
                        <MonthPicker value={month} onChange={setMonth} theme={theme} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.dateFieldLabel, { color: theme.ink3 }]}>Day</Text>
                        <TextInput
                            style={[
                                styles.fieldInput,
                                {
                                    backgroundColor: theme.surface,
                                    borderColor: theme.border,
                                    color: theme.ink,
                                    fontFamily: 'Geist-SemiBold',
                                },
                            ]}
                            placeholder="25"
                            placeholderTextColor={theme.ink3}
                            value={day}
                            onChangeText={setDay}
                            keyboardType="number-pad"
                            maxLength={2}
                        />
                    </View>
                </View>

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

    // Shared text input (title, month, day)
    fieldInput: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 14,
        fontFamily: 'Geist-Regular',
        marginBottom: 22,
    },

    // Date row — month picker + day input side by side
    dateRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 0,
    },
    dateFieldLabel: {
        fontFamily: 'JetBrainsMono-Regular',
        fontSize: 11,
        letterSpacing: 0.4,
        marginBottom: 6,
    },

    // Month picker — single visible row, matches fieldInput height
    pickerWrap: {
        height: ITEM_H,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 22,
    },
    pickerItem: {
        height: ITEM_H,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pickerItemText: {
        letterSpacing: -0.1,
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
