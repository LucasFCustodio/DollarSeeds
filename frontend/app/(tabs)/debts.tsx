/**
 * Debts tab — Debt Freedom, the plant-debts garden (snowball method).
 *
 * Every debt is a plant; paying it down grows it; paying it off breaks the pot and
 * sends water to the next one. The server computes all of it (lib/debtFreedom.ts);
 * this screen fetches, renders, and sequences the animations.
 *
 * Behind DEBT_FREEDOM_ENABLED: in a store build the tab is hidden and this route
 * redirects home.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Fonts, useTheme } from '@/context/ThemeContext';
import Button from '@/components/ui/Button';
import { DEBT_FREEDOM_ENABLED } from '@/constants/features';
import { useAnalytics } from '@/lib/analytics';
import { completeDebt, fetchGarden, type Debt, type Garden, type PaymentResult } from '@/lib/debtFreedom';
import { claimRandomBug, takeGardenAnimation, type PendingAnimation } from '@/lib/debtFreedomEvents';
import DebtGarden, { type DebtGardenHandle } from '@/components/debts/DebtGarden';
import GardenHeader, { type GardenMode } from '@/components/debts/GardenHeader';
import DebtCard from '@/components/debts/DebtCard';
import LogPaymentSheet from '@/components/debts/LogPaymentSheet';
import PlantView from '@/components/debts/PlantView';

const TAB_BAR_HEIGHT = 58;
const BUG_DELAY_AFTER_PAYMENT_MS = 2000;

export default function DebtsScreen() {
    if (!DEBT_FREEDOM_ENABLED) return <Redirect href="/(tabs)" />;
    return <DebtsGardenScreen />;
}

function DebtsGardenScreen() {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const analytics = useAnalytics();
    const isFocused = useIsFocused();

    const [garden, setGarden] = useState<Garden | null>(null);
    const [error, setError] = useState(false);
    const [mode, setMode] = useState<GardenMode>('plants');
    const [settled, setSettled] = useState<Debt | null>(null);
    const [payFor, setPayFor] = useState<Debt | null>(null);
    const [streamAnimId, setStreamAnimId] = useState<number | null>(null);
    const [appActive, setAppActive] = useState(AppState.currentState === 'active');
    const [completingId, setCompletingId] = useState<number | null>(null);

    const gardenRef = useRef<DebtGardenHandle>(null);
    const pending = useRef<PendingAnimation | null>(null);
    const afterStreamFocus = useRef<number | null>(null);

    // Pause everything when the tab is not focused or the app is backgrounded.
    useEffect(() => {
        const sub = AppState.addEventListener('change', s => setAppActive(s === 'active'));
        return () => sub.remove();
    }, []);
    const active = isFocused && appActive && mode === 'plants';

    const load = useCallback(async () => {
        try {
            const data = await fetchGarden();
            setGarden(data);
            setError(false);
            return data;
        } catch (e) {
            console.error('fetchGarden failed', e);
            setError(true);
            return null;
        }
    }, []);

    useFocusEffect(useCallback(() => {
        const queued = takeGardenAnimation();
        if (queued) pending.current = queued;
        load().then(data => {
            const p = pending.current;
            if (!data || !p) return;
            setMode('plants');
            // Give the list a frame to lay out the refreshed data, then bring the
            // debt on screen; the animation plays once it settles (effect below).
            setTimeout(() => gardenRef.current?.scrollToDebt(p.debtId), 60);
        });
    }, [load]));

    const byId = useMemo(() => new Map((garden?.debts ?? []).map(d => [d.id, d])), [garden]);

    // Keep the header's settled debt in step with fresh data.
    const settledDebt = settled ? byId.get(settled.id) ?? null : null;

    // Play a queued animation once its plant is the settled one.
    useEffect(() => {
        const p = pending.current;
        if (!p || !active || settledDebt?.id !== p.debtId) return;
        pending.current = null;
        const id = setTimeout(() => {
            const plant = gardenRef.current?.plant(p.debtId);
            if (!plant) return;
            if (p.kind === 'plant') plant.playPlant();
            else if (p.kind === 'payment') {
                plant.playPayment(p.extra ? 'extra' : 'minimum');
                if (settledDebt.species === 3) setTimeout(() => gardenRef.current?.plant(p.debtId)?.playBug(), BUG_DELAY_AFTER_PAYMENT_MS);
            }
        }, 350);
        return () => clearTimeout(id);
    }, [active, settledDebt]);

    // The flytrap's bug: a 20% chance, at most once per session, when one settles.
    useEffect(() => {
        if (!active || !settledDebt || settledDebt.species !== 3 || settledDebt.status === 'paid_off') return;
        if (settledDebt.growth_step < 5 || !claimRandomBug()) return;
        const id = setTimeout(() => gardenRef.current?.plant(settledDebt.id)?.playBug(), 900);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, settledDebt?.id]);

    const onSettledChange = useCallback((d: Debt | null) => setSettled(d), []);
    const openDetail = useCallback((id: number) => {
        router.push({ pathname: '/debtDetail', params: { id: String(id) } });
    }, [router]);
    const byIdRef = useRef(byId);
    byIdRef.current = byId;
    const openPay = useCallback((id: number) => setPayFor(byIdRef.current.get(id) ?? null), []);

    const onLogged = useCallback((result: PaymentResult, extra: boolean) => {
        setPayFor(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        const kinds = result.transactions.map(tx => tx.kind);
        analytics.debtPaymentLogged({
            debt_id: result.debt.id,
            kind: kinds.includes('payment_minimum') && kinds.includes('payment_extra')
                ? 'minimum_extra' : kinds.includes('payment_extra') ? 'extra' : 'minimum',
            growth_step: result.debt.growth_step,
        });
        const plant = gardenRef.current?.plant(result.debt.id);
        plant?.playPayment(extra ? 'extra' : 'minimum');
        // New numbers everywhere (the step change drives the grow transition,
        // which PlantView holds until the drops land).
        load();
        if (result.debt.species === 3 && result.debt.growth_step >= 5) {
            setTimeout(() => gardenRef.current?.plant(result.debt.id)?.playBug(), BUG_DELAY_AFTER_PAYMENT_MS);
        }
    }, [analytics, load]);

    const onComplete = useCallback(async (id: number) => {
        if (completingId != null) return;
        setCompletingId(id);
        try {
            const res = await completeDebt(id);
            analytics.debtPaidOff({ debt_id: id, position: res.debt.position, total: res.debt.total });
            await gardenRef.current?.plant(id)?.playComplete();
            const data = await load();
            const hasNext = !!data && data.debts.findIndex(d => d.id === id) < data.debts.length - 1;
            if (hasNext) {
                afterStreamFocus.current = res.focus_id;
                setStreamAnimId(id); // WaterStream reveals, then we scroll (below)
            }
        } catch (e) {
            console.error('completeDebt failed', e);
            Alert.alert(t('complete.errFailed'));
        } finally {
            setCompletingId(null);
        }
    }, [analytics, completingId, load, t]);

    const onStreamRevealed = useCallback(() => {
        setStreamAnimId(null);
        const next = afterStreamFocus.current;
        afterStreamFocus.current = null;
        if (next != null) setTimeout(() => gardenRef.current?.scrollToDebt(next), 250);
    }, []);

    const onAdd = useCallback(() => router.push('/debtForm'), [router]);
    const toggleMode = useCallback(() => setMode(m => (m === 'plants' ? 'cards' : 'plants')), []);

    const tabClear = Math.max(insets.bottom, 14) + TAB_BAR_HEIGHT;
    const focusDebt = garden?.focus_id != null ? byId.get(garden.focus_id) ?? null : null;
    const headerDebt = mode === 'plants' ? settledDebt : focusDebt ?? garden?.debts[garden.debts.length - 1] ?? null;

    if (!garden) {
        return (
            <View style={[styles.center, { backgroundColor: theme.bg }]}>
                {error ? (
                    <>
                        <Text style={{ color: theme.ink2, fontFamily: Fonts.sans, marginBottom: 12 }}>{t('detail.errLoad')}</Text>
                        <Button color={theme.brand} label={t('actions.retry')} variant="secondary" onPress={load} />
                    </>
                ) : (
                    <ActivityIndicator color={theme.brand} />
                )}
            </View>
        );
    }

    if (garden.debts.length === 0) {
        return <EmptyGarden onPlant={onAdd} topInset={insets.top} bottomInset={tabClear} />;
    }

    return (
        <View style={[styles.fill, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
            <GardenHeader
                debt={headerDebt}
                planEstPayoffMonth={garden.plan_est_payoff_month}
                mode={mode}
                onToggleMode={toggleMode}
                onAdd={onAdd}
            />
            {mode === 'plants' ? (
                <View style={[styles.fill, { marginBottom: tabClear }]}>
                    <DebtGarden
                        ref={gardenRef}
                        debts={garden.debts}
                        focusId={garden.focus_id}
                        active={active}
                        streamAnimId={streamAnimId}
                        busyId={completingId}
                        onSettledChange={onSettledChange}
                        onOpen={openDetail}
                        onLogPayment={openPay}
                        onComplete={onComplete}
                        onStreamRevealed={onStreamRevealed}
                    />
                </View>
            ) : (
                <FlatList
                    data={garden.debts}
                    keyExtractor={d => String(d.id)}
                    renderItem={({ item }) => <DebtCard debt={item} onPress={openDetail} />}
                    contentContainerStyle={{ paddingTop: 8, paddingBottom: tabClear + 16 }}
                    showsVerticalScrollIndicator={false}
                />
            )}
            <LogPaymentSheet debt={payFor} onClose={() => setPayFor(null)} onLogged={onLogged} />
        </View>
    );
}

function EmptyGarden({ onPlant, topInset, bottomInset }: { onPlant: () => void; topInset: number; bottomInset: number }) {
    const { t } = useTranslation('debts');
    const { theme } = useTheme();
    return (
        <View style={[styles.fill, styles.empty, { backgroundColor: theme.bg, paddingTop: topInset + 24, paddingBottom: bottomInset + 16 }]}>
            <Text style={[styles.emptyTitle, { color: theme.ink, fontFamily: Fonts.serif }]}>{t('empty.title')}</Text>
            <Text style={[styles.emptyBody, { color: theme.ink2, fontFamily: Fonts.sans }]}>{t('empty.body')}</Text>
            <View style={styles.emptyPlant}>
                <PlantView species={4} growthStep={0} state="seed" isFocus={false} active={false} width={240} />
            </View>
            <Button color={theme.brand} label={t('empty.cta')} variant="primary" size="lg" onPress={onPlant} />
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', paddingHorizontal: 28 },
    emptyTitle: { fontSize: 34, textAlign: 'center' },
    emptyBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 340 },
    emptyPlant: { marginVertical: 12 },
});
