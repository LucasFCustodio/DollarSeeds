import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import React, { useState, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';

const BASE = 'http://10.0.0.13:8000';
const BAR_MAX_WIDTH = Dimensions.get('window').width - 170;

interface WantsQuartiles {
    q25: number | null;
    q50: number | null;
    q75: number | null;
    q100: number | null;
}

interface TrendMonth {
    month: string;
    total_income: number;
    needs: number;
    wants: number;
    goals: number;
    budgets: { needs: number; wants: number; goals: number; };
    wants_quartiles: WantsQuartiles;
}

type CategoryKey = 'needs' | 'wants' | 'goals';

const CATEGORIES: { key: CategoryKey; label: string; color: string }[] = [
    { key: 'needs', label: '50% Needs', color: '#ff9d5c' },
    { key: 'wants', label: '30% Wants', color: '#4ECDC4' },
    { key: 'goals', label: '20% Goals', color: '#FFE66D' },
];

export default function TrendsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [trends, setTrends] = useState<TrendMonth[]>([]);
    const [loading, setLoading] = useState(true);

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
            <View key={key} style={styles.section}>
                <Text style={[styles.sectionTitle, { borderLeftColor: color }]}>{label}</Text>
                {rows.length === 0 ? (
                    <Text style={styles.emptyText}>No data logged yet.</Text>
                ) : rows.map(t => {
                    const budget = t.budgets[key];
                    const spent = t[key];
                    const ratio = budget > 0 ? spent / budget : 0;
                    const isOver = ratio > 1.0;
                    const barWidth = Math.min(1, ratio) * BAR_MAX_WIDTH;
                    const barColor = isOver ? '#dc3545' : color;

                    return (
                        <View key={t.month} style={styles.barRow}>
                            <Text style={styles.barLabel}>{t.month.slice(0, 3)}</Text>
                            <View style={styles.barTrack}>
                                <View style={[styles.barFill, { width: barWidth, backgroundColor: barColor }]} />
                            </View>
                            <Text style={[styles.barAmount, isOver && styles.overText]}>
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
        <ScrollView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <Button
                    label="← Back"
                    rgbaColor="#6c757d"
                    width="40%"
                    padding="10"
                    font="15"
                    onPress={() => router.back()}
                />
                <Text style={styles.title}>Spending Trends</Text>
                <Text style={styles.subtitle}>All months with logged data</Text>
            </View>

            {loading ? (
                <Text style={styles.emptyText}>Loading...</Text>
            ) : trends.length === 0 ? (
                <Text style={styles.emptyText}>No spending data yet. Start tracking to see trends!</Text>
            ) : (
                <View style={styles.body}>
                    {CATEGORIES.map(renderCategory)}

                    {/* Wants Spending Rhythm */}
                    {avgQ && (
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { borderLeftColor: '#4ECDC4' }]}>
                                Wants Spending Rhythm
                            </Text>
                            <Text style={styles.rhythmSub}>
                                On average, across {avgQ.months} month{avgQ.months > 1 ? 's' : ''}:
                            </Text>
                            {([
                                { label: '25% of wants spent by', day: avgQ.q25 },
                                { label: '50% of wants spent by', day: avgQ.q50 },
                                { label: '75% of wants spent by', day: avgQ.q75 },
                                { label: '100% of wants spent by', day: avgQ.q100 },
                            ] as { label: string; day: number | null }[]).map(({ label, day }) =>
                                day !== null && (
                                    <View key={label} style={styles.quartileRow}>
                                        <Text style={styles.quartileLabel}>{label}</Text>
                                        <Text style={styles.quartileDay}>Day {day}</Text>
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
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: {
        backgroundColor: '#fff',
        padding: 20,
        paddingTop: 60,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginBottom: 16,
    },
    title: { fontSize: 26, fontWeight: 'bold', color: '#212529', marginTop: 12 },
    subtitle: { fontSize: 13, color: '#adb5bd', marginTop: 4 },
    body: { paddingHorizontal: 20, paddingBottom: 40 },
    section: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#343a40',
        borderLeftWidth: 4,
        paddingLeft: 8,
        marginBottom: 14,
    },
    barRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    barLabel: {
        width: 34,
        fontSize: 12,
        fontWeight: '600',
        color: '#6c757d',
    },
    barTrack: {
        flex: 1,
        height: 18,
        backgroundColor: '#e9ecef',
        borderRadius: 4,
        overflow: 'hidden',
        marginHorizontal: 8,
    },
    barFill: { height: '100%', borderRadius: 4 },
    barAmount: {
        width: 58,
        fontSize: 12,
        fontWeight: '600',
        color: '#495057',
        textAlign: 'right',
    },
    overText: { color: '#dc3545' },
    emptyText: {
        textAlign: 'center',
        color: '#adb5bd',
        marginTop: 40,
        marginHorizontal: 20,
        fontSize: 14,
    },
    rhythmSub: {
        fontSize: 13,
        color: '#6c757d',
        marginBottom: 10,
        fontStyle: 'italic',
    },
    quartileRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    quartileLabel: { fontSize: 14, color: '#495057' },
    quartileDay: { fontSize: 14, fontWeight: '700', color: '#4ECDC4' },
});
