import { View, Text, StyleSheet, ScrollView, Dimensions, Pressable } from 'react-native';
import React, { useState, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const BASE = 'http://10.0.0.13:8000';
const BAR_MAX_WIDTH = Dimensions.get('window').width - 170;

interface WantsQuartiles { q25: number | null; q50: number | null; q75: number | null; q100: number | null; }
interface TrendMonth {
    month: string; total_income: number;
    needs: number; wants: number; goals: number;
    budgets: { needs: number; wants: number; goals: number; };
    wants_quartiles: WantsQuartiles;
}
type CategoryKey = 'needs' | 'wants' | 'goals';

export default function TrendsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme } = useTheme();
    const [trends, setTrends] = useState<TrendMonth[]>([]);
    const [loading, setLoading] = useState(true);

    const CATEGORIES: { key: CategoryKey; label: string; color: string }[] = [
        { key: 'needs', label: '50% Needs', color: theme.needs },
        { key: 'wants', label: '30% Wants', color: theme.wants },
        { key: 'goals', label: '20% Goals', color: theme.goals },
    ];

    useEffect(() => {
        axios.get(`${BASE}/dashboard/trends/?user_id=${user?.id}`)
            .then(res => setTrends(res.data.data))
            .catch(err => console.error('Error fetching trends:', err))
            .finally(() => setLoading(false));
    }, []);

    const getAvgQuartiles = () => {
        const valid = trends.filter(t => t.wants_quartiles.q25 !== null);
        if (valid.length === 0) return null;
        const avg = (key: keyof WantsQuartiles) => {
            const vals = valid.map(t => t.wants_quartiles[key]).filter((v): v is number => v !== null);
            return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        };
        return { q25: avg('q25'), q50: avg('q50'), q75: avg('q75'), q100: avg('q100'), months: valid.length };
    };

    const renderCategory = ({ key, label, color }: typeof CATEGORIES[0]) => {
        const rows = trends.filter(t => t.total_income > 0 || t[key] > 0);
        return (
            <View key={key} style={[styles.section, { backgroundColor: theme.surface }]}>
                <View style={[styles.sectionTitleRow, { borderLeftColor: color }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{label}</Text>
                </View>
                {rows.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>No data logged yet.</Text>
                ) : rows.map(t => {
                    const budget = t.budgets[key];
                    const spent = t[key];
                    const ratio = budget > 0 ? spent / budget : 0;
                    const isOver = ratio > 1.0;
                    const barWidth = Math.min(1, ratio) * BAR_MAX_WIDTH;
                    const barColor = isOver ? theme.danger : color;

                    return (
                        <View key={t.month} style={styles.barRow}>
                            <Text style={[styles.barLabel, { color: theme.textSecondary }]}>{t.month.slice(0, 3)}</Text>
                            <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
                                <View style={[styles.barFill, { width: barWidth, backgroundColor: barColor }]} />
                            </View>
                            <Text style={[styles.barAmount, { color: isOver ? theme.danger : theme.textSecondary }]}>
                                ${spent.toFixed(0)}{isOver ? ' ↑' : ''}
                            </Text>
                        </View>
                    );
                })}
            </View>
        );
    };

    const avgQ = getAvgQuartiles();

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
                <Pressable
                    onPress={() => router.back()}
                    style={[styles.backBtn, { backgroundColor: theme.inputBg }]}
                >
                    <Text style={[styles.backBtnText, { color: theme.textSecondary }]}>← Back</Text>
                </Pressable>
                <Text style={[styles.title, { color: theme.text }]}>Spending Trends</Text>
                <Text style={[styles.subtitle, { color: theme.textMuted }]}>All months with logged data</Text>
            </View>

            {loading ? (
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>Loading…</Text>
            ) : trends.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No spending data yet. Start tracking to see trends!</Text>
            ) : (
                <View style={styles.body}>
                    {CATEGORIES.map(renderCategory)}

                    {avgQ && (
                        <View style={[styles.section, { backgroundColor: theme.surface }]}>
                            <View style={[styles.sectionTitleRow, { borderLeftColor: theme.wants }]}>
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Wants Spending Rhythm</Text>
                            </View>
                            <Text style={[styles.rhythmSub, { color: theme.textMuted }]}>
                                On average, across {avgQ.months} month{avgQ.months > 1 ? 's' : ''}:
                            </Text>
                            {([
                                { label: '25% of wants spent by', day: avgQ.q25 },
                                { label: '50% of wants spent by', day: avgQ.q50 },
                                { label: '75% of wants spent by', day: avgQ.q75 },
                                { label: '100% of wants spent by', day: avgQ.q100 },
                            ] as { label: string; day: number | null }[]).map(({ label, day }) =>
                                day !== null && (
                                    <View key={label} style={[styles.quartileRow, { borderBottomColor: theme.borderSubtle }]}>
                                        <Text style={[styles.quartileLabel, { color: theme.textSecondary }]}>{label}</Text>
                                        <Text style={[styles.quartileDay, { color: theme.wants }]}>Day {day}</Text>
                                    </View>
                                )
                            )}
                        </View>
                    )}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        padding: 20, paddingTop: 60,
        borderBottomWidth: StyleSheet.hairlineWidth,
        marginBottom: 16,
    },
    backBtn: {
        alignSelf: 'flex-start', paddingHorizontal: 14,
        paddingVertical: 8, borderRadius: 20, marginBottom: 14,
    },
    backBtnText: { fontSize: 14, fontWeight: '600' },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
    subtitle: { fontSize: 13 },
    body: { paddingHorizontal: 16, paddingBottom: 40 },
    section: {
        borderRadius: 14, padding: 16, marginBottom: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    },
    sectionTitleRow: { borderLeftWidth: 4, paddingLeft: 10, marginBottom: 14 },
    sectionTitle: { fontSize: 15, fontWeight: '700' },
    barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    barLabel: { width: 34, fontSize: 12, fontWeight: '600' },
    barTrack: { flex: 1, height: 16, borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
    barFill: { height: '100%', borderRadius: 4 },
    barAmount: { width: 60, fontSize: 12, fontWeight: '600', textAlign: 'right' },
    emptyText: { textAlign: 'center', marginTop: 40, marginHorizontal: 20, fontSize: 14 },
    rhythmSub: { fontSize: 13, marginBottom: 10, fontStyle: 'italic' },
    quartileRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    quartileLabel: { fontSize: 14 },
    quartileDay: { fontSize: 14, fontWeight: '700' },
});
