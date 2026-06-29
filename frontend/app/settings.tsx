/**
 * Settings — user preferences (budget type, tithing, theme).
 *
 * Reachable from the dashboard hero (user/profile glass button).
 * Preferences read/write the backend /settings/ routes so they persist
 * per-user across devices.
 */
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    Pressable,
    Switch,
    Modal,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';

import { useAuth } from '../context/AuthContext';
import { useTheme, shadow } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import {
    IconChevronLeft, IconScripture, IconMoon, IconSun, IconTarget, IconSparkle,
} from '../components/icons';
import Button from '../components/ui/Button';
import BudgetTypeSelector from '../components/ui/BudgetTypeSelector';
import {
    BudgetTypeKey, BUDGET_TYPES, splitLabel, DEFAULT_BUDGET_TYPE,
} from '../constants/budgetTypes';

const BASE = 'https://dollarseeds-1.onrender.com';

export default function SettingsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme, isDark, toggleTheme } = useTheme();

    const [budgetType, setBudgetType] = useState<BudgetTypeKey>(DEFAULT_BUDGET_TYPE);
    const [ffPrompted, setFfPrompted] = useState(false);
    const [titheEnabled, setTitheEnabled] = useState(false);
    const [titheRate, setTitheRate] = useState(0.10);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Firm Foundation one-time goal suggestion
    const [showFirmPrompt, setShowFirmPrompt] = useState(false);
    const [suggestedEmergency, setSuggestedEmergency] = useState<number | null>(null);

    useFocusEffect(
        useCallback(() => {
            let active = true;
            (async () => {
                if (!user?.id) return;
                try {
                    const res = await axios.get(`${BASE}/settings/`, { params: { user_id: user.id } });
                    if (!active) return;
                    const data = res.data.data ?? {};
                    setBudgetType((data.budget_type as BudgetTypeKey) ?? DEFAULT_BUDGET_TYPE);
                    setFfPrompted(!!data.firm_foundation_goals_prompted);
                    setTitheEnabled(!!data.tithe_enabled);
                    setTitheRate(typeof data.tithe_rate === 'number' ? data.tithe_rate : 0.10);
                } catch (err) {
                    console.error('Settings fetch error:', err);
                } finally {
                    if (active) setLoading(false);
                }
            })();
            return () => { active = false; };
        }, [user?.id])
    );

    // Suggest ≈ 3× recent average monthly Needs spend, if trends data exists.
    const computeEmergencySuggestion = async (): Promise<number | null> => {
        if (!user?.id) return null;
        try {
            const res = await axios.get(`${BASE}/dashboard/trends/`, { params: { user_id: user.id } });
            const rows: any[] = res.data.data ?? [];
            const needsMonths = rows.map(r => r.needs).filter((n: number) => n > 0);
            if (needsMonths.length === 0) return null;
            const avg = needsMonths.reduce((a: number, b: number) => a + b, 0) / needsMonths.length;
            return Math.round((avg * 3) / 50) * 50; // round to nearest $50
        } catch {
            return null;
        }
    };

    const handleSelectBudgetType = async (key: BudgetTypeKey) => {
        if (!user?.id || key === budgetType) return;
        const previous = budgetType;
        setBudgetType(key); // optimistic
        setSaving(true);
        try {
            await axios.patch(`${BASE}/settings/`, { user_id: user.id, budget_type: key });
            // One-time Firm Foundation goal suggestion
            if (key === 'firm_foundation' && !ffPrompted) {
                const suggested = await computeEmergencySuggestion();
                setSuggestedEmergency(suggested);
                setShowFirmPrompt(true);
            }
        } catch (err) {
            console.error('Budget type update error:', err);
            setBudgetType(previous);
        } finally {
            setSaving(false);
        }
    };

    // Mark the suggestion as seen so it never nags again, then optionally route to
    // the Goals create flow (pre-filled with the emergency fund).
    const resolveFirmPrompt = async (setUp: boolean) => {
        setShowFirmPrompt(false);
        setFfPrompted(true);
        if (user?.id) {
            axios.patch(`${BASE}/settings/`, { user_id: user.id, firm_foundation_goals_prompted: true })
                .catch(err => console.error('Prompt flag update error:', err));
        }
        if (setUp) {
            router.push({
                pathname: '/(tabs)/piggyBank',
                params: {
                    createGoal: '1',
                    goalType: 'saving',
                    title: '3-Month Emergency Fund',
                    amount: suggestedEmergency != null ? String(suggestedEmergency) : '',
                },
            } as any);
        }
    };

    const ratePct = Math.round(titheRate * 100);
    const activeType = BUDGET_TYPES[budgetType];

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
        >
            {/* ── Firm Foundation goal suggestion ──────────────────────────── */}
            <Modal visible={showFirmPrompt} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: theme.surface, ...shadow(9) }]}>
                        <View style={[styles.modalIconTile, { backgroundColor: theme.brandSoft }]}>
                            <IconSparkle size={26} color={theme.brand} />
                        </View>
                        <Text style={[styles.modalTitle, { color: theme.ink }]}>
                            Let's build your foundation
                        </Text>
                        <Text style={[styles.modalBody, { color: theme.ink2 }]}>
                            Firm Foundation is about stability. Two goals make a big difference — and
                            every dollar toward them is real progress:
                        </Text>

                        <View style={[styles.suggestRow, { backgroundColor: theme.dangerSoft }]}>
                            <IconTarget size={18} color={theme.danger} />
                            <Text style={[styles.suggestText, { color: theme.ink }]}>
                                A <Text style={{ fontFamily: 'Geist-SemiBold' }}>Debt</Text> goal to pay down what you owe
                            </Text>
                        </View>
                        <View style={[styles.suggestRow, { backgroundColor: theme.goalsSoft }]}>
                            <IconTarget size={18} color={theme.goals} />
                            <Text style={[styles.suggestText, { color: theme.ink }]}>
                                A <Text style={{ fontFamily: 'Geist-SemiBold' }}>3-Month Emergency Fund</Text>
                                {suggestedEmergency != null ? ` — aim for about $${suggestedEmergency.toLocaleString('en-US')}` : ''}
                            </Text>
                        </View>

                        <View style={{ height: 8 }} />
                        <Button
                            label="Set these up"
                            variant="primary"
                            size="lg"
                            fullWidth
                            color={theme.brand}
                            onPress={() => resolveFirmPrompt(true)}
                        />
                        <Pressable onPress={() => resolveFirmPrompt(false)} style={styles.laterBtn}>
                            <Text style={[styles.laterText, { color: theme.ink3 }]}>Maybe later</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* Header */}
            <View style={[styles.header, { paddingTop: 56 }]}>
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
                <View>
                    <Text style={[styles.eyebrow, { color: theme.ink3 }]}>PREFERENCES</Text>
                    <Text style={[styles.title, { color: theme.ink }]}>Settings</Text>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.brand} style={{ marginTop: 60 }} />
            ) : (
                <View style={styles.content}>
                    {/* ── Budget type section ─────────────────────────────── */}
                    <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>BUDGET SPLIT</Text>
                    <Text style={[styles.sectionHint, { color: theme.ink2 }]}>
                        Pick the split that fits your situation. Changes apply to this month and
                        going forward — past months stay as they were.
                    </Text>
                    <BudgetTypeSelector value={budgetType} onSelect={handleSelectBudgetType} disabled={saving} />

                    {/* ── Tithing section ─────────────────────────────────── */}
                    <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 26 }]}>GIVING</Text>

                    <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(7) }]}>
                        <View style={styles.rowTop}>
                            <View style={[styles.iconTile, { backgroundColor: theme.harvest }]}>
                                <IconScripture size={22} color={theme.brand} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: theme.ink }]}>Tithing</Text>
                                <Text style={[styles.rowSub, { color: theme.ink2 }]}>
                                    Set aside {ratePct}% as a tithe before budgeting
                                </Text>
                            </View>
                            <Switch
                                value={titheEnabled}
                                onValueChange={handleToggleTithe}
                                disabled={saving}
                                trackColor={{ false: theme.borderSoft, true: theme.brand }}
                                thumbColor="#fff"
                            />
                        </View>

                        <View style={[styles.explainBox, { backgroundColor: theme.surfaceSoft, borderTopColor: theme.borderSoft }]}>
                            <Text style={[styles.explainText, { color: theme.ink2 }]}>
                                When on, {ratePct}% of new income is carved into a Tithe envelope first,
                                and your {splitLabel(activeType)} budget is calculated on the remaining {100 - ratePct}%.
                                Past months keep their original split.
                            </Text>
                        </View>
                    </View>

                    {/* ── Appearance section ──────────────────────────────── */}
                    <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 26 }]}>APPEARANCE</Text>

                    <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(7) }]}>
                        <View style={styles.rowTop}>
                            <View style={[styles.iconTile, { backgroundColor: theme.brandSoft }]}>
                                {isDark
                                    ? <IconSun size={22} color={theme.brand} />
                                    : <IconMoon size={22} color={theme.brand} />}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: theme.ink }]}>Dark mode</Text>
                                <Text style={[styles.rowSub, { color: theme.ink2 }]}>
                                    {isDark ? 'On' : 'Off'} · system-aware by default
                                </Text>
                            </View>
                            <Switch
                                value={isDark}
                                onValueChange={toggleTheme}
                                trackColor={{ false: theme.borderSoft, true: theme.brand }}
                                thumbColor="#fff"
                            />
                        </View>
                    </View>

                    {/* ── Log out ─────────────────────────────────────────── */}
                    <Pressable
                        onPress={handleLogout}
                        style={({ pressed }) => [
                            styles.logoutBtn,
                            { backgroundColor: theme.danger },
                            pressed && { opacity: 0.85 },
                        ]}
                    >
                        <Text style={styles.logoutText}>Log Out</Text>
                    </Pressable>
                </View>
            )}
        </ScrollView>
    );

    // ── Handlers that need component scope ──────────────────────────────────
    async function handleLogout() {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Error logging out:', error.message);
        // AuthContext flips to the signed-out state and the router redirects to /auth.
    }

    function handleToggleTithe(value: boolean) {
        if (!user?.id) return;
        const previous = titheEnabled;
        setTitheEnabled(value);
        setSaving(true);
        axios.patch(`${BASE}/settings/`, { user_id: user.id, tithe_enabled: value })
            .catch(err => { console.error('Settings update error:', err); setTitheEnabled(previous); })
            .finally(() => setSaving(false));
    }
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 20,
        paddingBottom: 8,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
    },
    eyebrow: { fontFamily: 'JetBrainsMono-SemiBold', fontSize: 10, letterSpacing: 1.8 },
    title: { fontFamily: 'InstrumentSerif-Regular', fontSize: 28, marginTop: 2 },

    content: { paddingHorizontal: 18, marginTop: 18 },
    sectionLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 11,
        letterSpacing: 1.4,
        marginBottom: 8,
        paddingHorizontal: 4,
    },
    sectionHint: {
        fontFamily: 'Geist-Regular',
        fontSize: 12,
        lineHeight: 17,
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    card: { borderRadius: 18, overflow: 'hidden' },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    iconTile: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontFamily: 'Geist-SemiBold', fontSize: 16, letterSpacing: -0.2 },
    rowSub: { fontFamily: 'Geist-Regular', fontSize: 12, marginTop: 2 },

    explainBox: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
    explainText: { fontFamily: 'Geist-Regular', fontSize: 12, lineHeight: 18 },

    // Firm Foundation modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
    },
    modalCard: { width: '100%', borderRadius: 22, padding: 22, alignItems: 'stretch' },
    modalIconTile: {
        width: 52, height: 52, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 12, alignSelf: 'center',
    },
    modalTitle: { fontFamily: 'InstrumentSerif-Regular', fontSize: 24, textAlign: 'center', marginBottom: 6 },
    modalBody: { fontFamily: 'Geist-Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 14 },
    suggestRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 12, borderRadius: 12, marginBottom: 8,
    },
    suggestText: { flex: 1, fontFamily: 'Geist-Regular', fontSize: 13, lineHeight: 18 },
    laterBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    laterText: { fontFamily: 'Geist-SemiBold', fontSize: 13 },

    // Log out
    logoutBtn: {
        marginTop: 32,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoutText: { fontFamily: 'Geist-SemiBold', fontSize: 15, color: '#fff' },
});
