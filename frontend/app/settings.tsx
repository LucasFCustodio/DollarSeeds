/**
 * Settings — user preferences (tithing, theme).
 *
 * Reachable from the dashboard hero (user/profile glass button).
 * The tithing toggle reads/writes the backend /settings/ routes so the
 * preference persists per-user across devices.
 */
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    Pressable,
    Switch,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';

import { useAuth } from '../context/AuthContext';
import { useTheme, shadow } from '../context/ThemeContext';
import {
    IconChevronLeft, IconScripture, IconMoon, IconSun,
} from '../components/icons';

const BASE = 'https://dollarseeds-1.onrender.com';

export default function SettingsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme, isDark, toggleTheme } = useTheme();

    const [titheEnabled, setTitheEnabled] = useState(false);
    const [titheRate, setTitheRate] = useState(0.10);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useFocusEffect(
        useCallback(() => {
            let active = true;
            (async () => {
                if (!user?.id) return;
                try {
                    const res = await axios.get(`${BASE}/settings/`, { params: { user_id: user.id } });
                    if (!active) return;
                    const data = res.data.data ?? {};
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

    const handleToggleTithe = async (value: boolean) => {
        if (!user?.id) return;
        // Optimistic update — revert on failure
        const previous = titheEnabled;
        setTitheEnabled(value);
        setSaving(true);
        try {
            await axios.patch(`${BASE}/settings/`, { user_id: user.id, tithe_enabled: value });
        } catch (err) {
            console.error('Settings update error:', err);
            setTitheEnabled(previous);
        } finally {
            setSaving(false);
        }
    };

    const ratePct = Math.round(titheRate * 100);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
        >
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
                    {/* ── Tithing section ─────────────────────────────────── */}
                    <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>GIVING</Text>

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
                                and your 50/30/20 budget is calculated on the remaining {100 - ratePct}%.
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
                </View>
            )}
        </ScrollView>
    );
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
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    card: { borderRadius: 18, overflow: 'hidden' },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    iconTile: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontFamily: 'Geist-SemiBold', fontSize: 16, letterSpacing: -0.2 },
    rowSub: { fontFamily: 'Geist-Regular', fontSize: 12, marginTop: 2 },

    explainBox: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
    explainText: { fontFamily: 'Geist-Regular', fontSize: 12, lineHeight: 18 },
});
