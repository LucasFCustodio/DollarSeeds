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
import { completeDebt, fetchGarden, type Debt, type Garden, type OneDebt, type PaymentResult } from '@/lib/debtFreedom';
import { claimRandomBug, takeGardenAnimation, type PendingAnimation } from '@/lib/debtFreedomEvents';
import DebtGarden, { type DebtGardenHandle } from '@/components/debts/DebtGarden';
import GardenHeader, { type GardenMode } from '@/components/debts/GardenHeader';
import DebtCard from '@/components/debts/DebtCard';
import LogPaymentSheet from '@/components/debts/LogPaymentSheet';
import CheckinSheet from '@/components/debts/CheckinSheet';
import LateFeeSheet from '@/components/debts/LateFeeSheet';
import PlanSettingsSheet from '@/components/debts/PlanSettingsSheet';
import { useMinToggle } from '@/components/debts/useMinToggle';
import PlantView from '@/components/debts/PlantView';

const TAB_BAR_HEIGHT = 58;
const BUG_DELAY_AFTER_PAYMENT_MS = 2000;
/** The late-fee question waits this long after its plant settles. */
const LATE_FEE_ASK_DELAY_MS = 700;

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
    const [checkinFor, setCheckinFor] = useState<Debt | null>(null);
    const [lateFeeFor, setLateFeeFor] = useState<Debt | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [streamAnimId, setStreamAnimId] = useState<number | null>(null);
    const [appActive, setAppActive] = useState(AppState.currentState === 'active');
    const [completingId, setCompletingId] = useState<number | null>(null);

    const gardenRef = useRef<DebtGardenHandle>(null);
    const pending = useRef<PendingAnimation | null>(null);
    const afterStreamFocus = useRef<number | null>(null);
    /** `${debt id}:${due date}` late-fee questions already asked this session. */
    const askedLateFee = useRef(new Set<string>());

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

    // The late-fee question: once per missed due date per session, when its plant
    // settles and nothing else is open.
    const sheetOpen = !!payFor || !!checkinFor || !!lateFeeFor || settingsOpen;
    useEffect(() => {
        const due = settledDebt?.late_fee_pending_for;
        if (!active || !settledDebt || !due || sheetOpen || pending.current) return;
        const key = `${settledDebt.id}:${due}`;
        if (askedLateFee.current.has(key)) return;
        const id = setTimeout(() => {
            askedLateFee.current.add(key);
            setLateFeeFor(settledDebt);
        }, LATE_FEE_ASK_DELAY_MS);
        return () => clearTimeout(id);
    }, [active, settledDebt, sheetOpen]);

    const onSettledChange = useCallback((d: Debt | null) => setSettled(d), []);
    const openDetail = useCallback((id: number) => {
        router.push({ pathname: '/debtDetail', params: { id: String(id) } });
    }, [router]);
    const byIdRef = useRef(byId);
    byIdRef.current = byId;
    const openExtra = useCallback((id: number) => setPayFor(byIdRef.current.get(id) ?? null), []);

    // Drops on the plant, then new numbers everywhere (the step change drives the grow
    // transition, which PlantView holds until the drops land).
    const water = useCallback((result: OneDebt, kind: 'minimum' | 'extra') => {
        gardenRef.current?.plant(result.debt.id)?.playPayment(kind);
        load();
        if (result.debt.species === 3 && result.debt.growth_step >= 5) {
            setTimeout(() => gardenRef.current?.plant(result.debt.id)?.playBug(), BUG_DELAY_AFTER_PAYMENT_MS);
        }
    }, [load]);

    const onLogged = useCallback((result: PaymentResult) => {
        setPayFor(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        analytics.debtPaymentLogged({ debt_id: result.debt.id, kind: 'extra', growth_step: result.debt.growth_step });
        water(result, 'extra');
    }, [analytics, water]);

    const onToggled = useCallback((result: OneDebt, on: boolean) => {
        // The server's answer, applied now: the switch must not sit on the old state
        // (inviting a second log) while the full garden reloads.
        setGarden(g => g && { ...g, debts: g.debts.map(d => (d.id === result.debt.id ? result.debt : d)) });
        if (on) water(result, 'minimum');
        else load();   // the plant keeps its highest step; only the numbers change
    }, [load, water]);
    const { toggle, pendingValueFor } = useMinToggle(onToggled, load);
    const onToggleMin = useCallback((id: number) => {
        const d = byIdRef.current.get(id);
        if (d) toggle(d);
    }, [toggle]);

    const onCheckinSaved = useCallback(() => { load(); }, [load]);
    const onLateFeeAnswered = useCallback(() => {
        setLateFeeFor(null);
        load();
    }, [load]);

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
    const openSettings = useCallback(() => setSettingsOpen(true), []);
    const openCheckin = useCallback((d: Debt) => setCheckinFor(d), []);

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
                onSettings={openSettings}
                onCheckin={openCheckin}
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
                        togglePendingFor={pendingValueFor}
                        onSettledChange={onSettledChange}
                        onOpen={openDetail}
                        onToggleMin={onToggleMin}
                        onExtra={openExtra}
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
            <CheckinSheet debt={checkinFor} onClose={() => setCheckinFor(null)} onSaved={onCheckinSaved} />
            <LateFeeSheet debt={lateFeeFor} onClose={() => setLateFeeFor(null)} onAnswered={onLateFeeAnswered} />
            <PlanSettingsSheet visible={settingsOpen} monthlyExtra={garden.monthly_extra}
                onClose={() => setSettingsOpen(false)} onSaved={load} />
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
