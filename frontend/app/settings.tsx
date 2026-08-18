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
    TextInput,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';

import * as WebBrowser from 'expo-web-browser';

import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { useTheme, shadow, Fonts, AppTheme } from '../context/ThemeContext';
import { useOnboarding } from '../context/OnboardingContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useLocale } from '../context/LocaleContext';
import { SUPPORTED_LANGUAGES } from '../lib/i18n';
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '../constants/currencies';
import { DEV_ACCOUNT_EMAIL } from '../constants/onboarding';
import { DISCLAIMER_FULL, TERMS_URL, PRIVACY_URL } from '../constants/legal';
import { MANAGE_SUBSCRIPTION_URL } from '../constants/premium';
import { supabase } from '../lib/supabase';
import {
    IconChevronLeft, IconScripture, IconMoon, IconSun, IconTarget, IconSparkle, IconCheck,
} from '../components/icons';
import Button from '../components/ui/Button';
import PremiumCta from '../components/premium/PremiumCta';
import BudgetTypeSelector from '../components/ui/BudgetTypeSelector';
import {
    BudgetTypeKey, BUDGET_TYPES, splitLabel, DEFAULT_BUDGET_TYPE,
} from '../constants/budgetTypes';

const BASE = 'https://dollarseeds-1.onrender.com';

export default function SettingsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { theme, isDark, toggleTheme } = useTheme();
    const { replay: replayOnboarding } = useOnboarding();
    const { restore: restorePremium } = useSubscription();
    const { t } = useTranslation(['settings', 'common', 'premium']);
    const { language, setLanguage, currency, setCurrency, formatMoney } = useLocale();
    const [restoring, setRestoring] = useState(false);
    const isDevAccount = user?.email === DEV_ACCOUNT_EMAIL;

    /**
     * Changing the symbol does NOT convert anything already recorded — amounts are
     * stored as plain numbers with no currency dimension. Say so once, explicitly,
     * rather than letting someone discover it by finding their history relabelled.
     */
    function handleSelectCurrency(next: CurrencyCode) {
        if (next === currency) return;
        Alert.alert(
            t('settings:currency.confirmTitle'),
            t('settings:currency.confirmBody'),
            [
                { text: t('common:action.cancel'), style: 'cancel' },
                { text: t('settings:currency.confirmAccept'), onPress: () => setCurrency(next) },
            ],
        );
    }

    const [budgetType, setBudgetType] = useState<BudgetTypeKey>(DEFAULT_BUDGET_TYPE);
    const [ffPrompted, setFfPrompted] = useState(false);
    const [titheEnabled, setTitheEnabled] = useState(false);
    const [titheRate, setTitheRate] = useState(0.10);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Firm Foundation one-time goal suggestion
    const [showFirmPrompt, setShowFirmPrompt] = useState(false);
    const [suggestedEmergency, setSuggestedEmergency] = useState<number | null>(null);

    // Account deletion
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [deleteError, setDeleteError] = useState(false);
    const [deleting, setDeleting] = useState(false);

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
                                {suggestedEmergency != null ? t('settings:firmFoundation.emergencyHint', { amount: formatMoney(suggestedEmergency) }) : ''}
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
                    <Text style={[styles.title, { color: theme.ink }]}>{t('settings:title')}</Text>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.brand} style={{ marginTop: 60 }} />
            ) : (
                <View style={styles.content}>
                    {/* ── Budget type section ─────────────────────────────── */}
                    <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>{t('settings:section.budgetSplit')}</Text>
                    <Text style={[styles.sectionHint, { color: theme.ink2 }]}>
                        Pick the split that fits your situation. Changes apply to this month and
                        going forward — past months stay as they were.
                    </Text>
                    <BudgetTypeSelector value={budgetType} onSelect={handleSelectBudgetType} disabled={saving} />

                    {/* ── Premium section ─────────────────────────────────── */}
                    {/* Swaps to "Manage Subscription" once subscribed — a paying user
                        must never be asked to subscribe again. */}
                    <PremiumCta placement="settings" style={{ marginTop: 26 }} />

                    {/* Restore Purchases. Also on the paywall, but required to be
                        findable by someone who has reinstalled and therefore sees no
                        paywall to open — they are already "subscribed" as far as the
                        store is concerned, just not on this device yet. */}
                    <Pressable
                        onPress={handleRestorePurchases}
                        disabled={restoring}
                        style={({ pressed }) => [
                            styles.restoreRow,
                            { backgroundColor: theme.surface, borderColor: theme.border },
                            pressed && { opacity: 0.6 },
                        ]}
                    >
                        {restoring
                            ? <ActivityIndicator color={theme.brand} />
                            : <Text style={[styles.restoreText, { color: theme.brand }]}>
                                Restore Purchases
                            </Text>}
                    </Pressable>

                    {/* ── Tithing section ─────────────────────────────────── */}
                    <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 26 }]}>{t('settings:section.giving')}</Text>

                    <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(7) }]}>
                        <View style={styles.rowTop}>
                            <View style={[styles.iconTile, { backgroundColor: theme.harvest }]}>
                                <IconScripture size={22} color={theme.brand} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: theme.ink }]}>{t('settings:tithing.title')}</Text>
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
                    <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 26 }]}>{t('settings:section.appearance')}</Text>

                    <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(7) }]}>
                        <View style={styles.rowTop}>
                            <View style={[styles.iconTile, { backgroundColor: theme.brandSoft }]}>
                                {isDark
                                    ? <IconSun size={22} color={theme.brand} />
                                    : <IconMoon size={22} color={theme.brand} />}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: theme.ink }]}>{t('settings:appearance.darkMode')}</Text>
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

                    {/* ── Language & currency ─────────────────────────────── */}
                    {/* Two INDEPENDENT settings. Language changes the words and the
                        number separators; currency changes only the symbol. Neither
                        constrains the other, and all four combinations are valid. */}
                    <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 26 }]}>
                        {t('settings:section.languageCurrency')}
                    </Text>

                    <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(7) }]}>
                        <View style={styles.rowTop}>
                            <View style={[styles.iconTile, { backgroundColor: theme.brandSoft }]}>
                                <IconScripture size={22} color={theme.brand} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: theme.ink }]}>
                                    {t('settings:language.title')}
                                </Text>
                                <Text style={[styles.rowSub, { color: theme.ink2 }]}>
                                    {t('settings:language.subtitle')}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.optionList}>
                            {SUPPORTED_LANGUAGES.map(tag => (
                                <OptionRow
                                    key={tag}
                                    theme={theme}
                                    label={t(`settings:language.${tag}`)}
                                    selected={language === tag}
                                    onPress={() => setLanguage(tag)}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(7), marginTop: 12 }]}>
                        <View style={styles.rowTop}>
                            <View style={[styles.iconTile, { backgroundColor: theme.harvest }]}>
                                <IconTarget size={22} color={theme.brand} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: theme.ink }]}>
                                    {t('settings:currency.title')}
                                </Text>
                                <Text style={[styles.rowSub, { color: theme.ink2 }]}>
                                    {t('settings:currency.subtitle')}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.optionList}>
                            {CURRENCY_CODES.map(code => (
                                <OptionRow
                                    key={code}
                                    theme={theme}
                                    label={t(CURRENCIES[code].labelKey)}
                                    selected={currency === code}
                                    onPress={() => handleSelectCurrency(code)}
                                />
                            ))}
                        </View>
                    </View>

                    {/* ── Dev tools (dev account only) ─────────────────────── */}
                    {isDevAccount && (
                        <>
                            <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 26 }]}>{t('settings:section.dev')}</Text>
                            <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(7) }]}>
                                <View style={styles.rowTop}>
                                    <View style={[styles.iconTile, { backgroundColor: theme.brandSoft }]}>
                                        <IconSparkle size={22} color={theme.brand} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.rowTitle, { color: theme.ink }]}>Onboarding tour</Text>
                                        <Text style={[styles.rowSub, { color: theme.ink2 }]}>
                                            Replay the first-run guided tour
                                        </Text>
                                    </View>
                                </View>
                                <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                                    <Button
                                        label="Replay Onboarding Tour"
                                        variant="secondary"
                                        size="lg"
                                        fullWidth
                                        color={theme.brand}
                                        onPress={handleReplayOnboarding}
                                    />
                                </View>
                            </View>
                        </>
                    )}

                    {/* ── About & legal ───────────────────────────────────── */}
                    <Text style={[styles.sectionLabel, { color: theme.ink3, marginTop: 26 }]}>{t('settings:section.about')}</Text>

                    <View style={[styles.card, { backgroundColor: theme.surface, ...shadow(7) }]}>
                        <View style={styles.legalBody}>
                            <Text style={[styles.legalText, { color: theme.ink3 }]}>
                                {DISCLAIMER_FULL}
                            </Text>
                        </View>

                        <Pressable
                            onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
                            style={({ pressed }) => [
                                styles.legalLinkRow,
                                { borderTopColor: theme.borderSoft },
                                pressed && { opacity: 0.6 },
                            ]}
                        >
                            <Text style={[styles.legalLinkText, { color: theme.brand }]}>
                                Terms of Service
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
                            style={({ pressed }) => [
                                styles.legalLinkRow,
                                { borderTopColor: theme.borderSoft },
                                pressed && { opacity: 0.6 },
                            ]}
                        >
                            <Text style={[styles.legalLinkText, { color: theme.brand }]}>
                                Privacy Policy
                            </Text>
                        </Pressable>
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
                        <Text style={styles.logoutText}>{t('settings:logout')}</Text>
                    </Pressable>

                    {/* ── Danger zone: delete account (very bottom) ────────── */}
                    <View style={[styles.dangerZone, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
                        <Text style={[styles.dangerLabel, { color: theme.danger }]}>{t('settings:section.dangerZone')}</Text>
                        <Text style={[styles.dangerHint, { color: theme.ink2 }]}>
                            Permanently delete your account and every record tied to it.
                        </Text>
                        <Pressable
                            onPress={() => { setDeleteConfirm(''); setDeleteError(false); setShowDeleteModal(true); }}
                            style={({ pressed }) => [
                                styles.deleteBtn,
                                { backgroundColor: theme.danger },
                                pressed && { opacity: 0.85 },
                            ]}
                        >
                            <Text style={styles.deleteText}>{t('settings:delete.button')}</Text>
                        </Pressable>
                    </View>
                </View>
            )}

            {/* ── Delete account confirmation ──────────────────────────────── */}
            <Modal visible={showDeleteModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: theme.surface, ...shadow(9) }]}>
                        <Text style={[styles.modalTitle, { color: theme.danger }]}>Delete account</Text>
                        <Text style={[styles.modalBody, { color: theme.ink2 }]}>
                            Deleting the account is irreversible. You'll lose all the information you've
                            tracked. If you want to delete your account, type "DELETE" in the text box
                            below, then click Delete.
                        </Text>

                        {/* App Review 5.1.1(v): deleting the account does NOT cancel an
                            App Store subscription — the user keeps being billed for
                            something they can no longer reach. They have to be told,
                            and given the place to do it. */}
                        <View style={[styles.subWarning, { backgroundColor: theme.harvestSoft }]}>
                            <Text style={[styles.subWarningText, { color: theme.ink }]}>
                                {t('premium:deleteAccountWarning')}
                            </Text>
                            <Pressable
                                onPress={() => WebBrowser.openBrowserAsync(MANAGE_SUBSCRIPTION_URL)}
                                hitSlop={6}
                            >
                                <Text style={[styles.subWarningLink, { color: theme.brand }]}>
                                    Manage subscriptions
                                </Text>
                            </Pressable>
                        </View>

                        {deleteError && (
                            <Text style={[styles.deleteErrorText, { color: theme.danger }]}>
                                That's not right — type "DELETE" exactly to confirm.
                            </Text>
                        )}

                        <TextInput
                            value={deleteConfirm}
                            onChangeText={(t) => { setDeleteConfirm(t); if (deleteError) setDeleteError(false); }}
                            placeholder="DELETE"
                            placeholderTextColor={theme.ink3}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            editable={!deleting}
                            style={[styles.deleteInput, {
                                backgroundColor: theme.surfaceSoft,
                                borderColor: theme.border,
                                color: theme.ink,
                            }]}
                        />

                        <View style={{ height: 8 }} />
                        <Pressable
                            onPress={handleDeleteAccount}
                            disabled={deleting}
                            style={({ pressed }) => [
                                styles.deleteBtn,
                                { backgroundColor: theme.danger },
                                (pressed || deleting) && { opacity: 0.85 },
                            ]}
                        >
                            {deleting
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.deleteText}>Delete</Text>}
                        </Pressable>
                        <Pressable
                            onPress={() => setShowDeleteModal(false)}
                            disabled={deleting}
                            style={styles.laterBtn}
                        >
                            <Text style={[styles.laterText, { color: theme.ink3 }]}>Cancel</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );

    // ── Handlers that need component scope ──────────────────────────────────
    async function handleLogout() {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Error logging out:', error.message);
        // AuthContext flips to the signed-out state and the router redirects to /auth.
    }

    async function handleRestorePurchases() {
        setRestoring(true);
        const result = await restorePremium();
        setRestoring(false);

        if (result.status === 'restored') {
            Alert.alert('Purchases restored', 'Your subscription is active again.');
        } else if (result.status === 'nothing') {
            Alert.alert(
                'Nothing to restore',
                'No previous subscription was found for this account.',
            );
        } else if (result.status === 'unavailable') {
            Alert.alert('Unavailable', 'Purchases are not available on this device yet.');
        } else {
            Alert.alert('Could not restore', result.message);
        }
    }

    // Dev-only: clear the completed flag and restart the tour from the Dashboard.
    function handleReplayOnboarding() {
        replayOnboarding();
        router.replace('/(tabs)' as any);
    }

    // Sends the typed confirmation to the backend, which is the authoritative
    // check: only exactly "DELETE" deletes the account. Anything else no-ops
    // silently (no alert). On success, sign out → AuthContext routes to /auth.
    async function handleDeleteAccount() {
        if (!user?.id || deleting) return;
        setDeleting(true);
        try {
            const res = await axios.post(`${BASE}/account/delete/`, {
                user_id: user.id,
                confirmation: deleteConfirm,
            });
            if (res.data?.deleted) {
                await supabase.auth.signOut();
                // AuthContext flips to signed-out and the router redirects to /auth.
            } else {
                // Wrong/empty confirmation — backend refused. Nudge the user.
                setDeleteError(true);
            }
        } catch (err) {
            console.error('Account deletion error:', err);
            setDeleteError(true);
        } finally {
            setDeleting(false);
        }
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

/**
 * A single selectable row inside a settings card — used by both the language and the
 * currency pickers. Deliberately plain: these are two-option lists today but the
 * language list grows every time a locale folder is added, so it renders from data
 * rather than being hand-written per option.
 */
function OptionRow({
    theme, label, selected, onPress,
}: {
    theme: AppTheme;
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
                styles.optionRow,
                { borderColor: selected ? theme.brand : theme.border },
                selected && { backgroundColor: theme.brandSoft },
                pressed && { opacity: 0.7 },
            ]}
        >
            <Text style={[
                styles.optionLabel,
                { color: selected ? theme.brand : theme.ink },
            ]}>
                {label}
            </Text>
            {selected && <IconCheck size={16} color={theme.brand} />}
        </Pressable>
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

    // About & legal
    legalBody: { paddingHorizontal: 16, paddingVertical: 14 },
    legalText: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },
    legalLinkRow: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
    legalLinkText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },

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

    // Language & currency pickers
    optionList: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        gap: 8,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    optionLabel: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 14,
        flexShrink: 1,
    },

    // Premium
    restoreRow: {
        marginTop: 10,
        paddingVertical: 13,
        borderRadius: 14,
        borderWidth: 1.5,
        alignItems: 'center',
    },
    restoreText: { fontFamily: 'Geist-SemiBold', fontSize: 14 },
    subWarning: {
        borderRadius: 12,
        padding: 12,
        marginBottom: 14,
        gap: 6,
        alignItems: 'center',
    },
    subWarningText: {
        fontFamily: 'Geist-Regular',
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    subWarningLink: {
        fontFamily: 'Geist-SemiBold',
        fontSize: 12,
        textDecorationLine: 'underline',
    },
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

    // Danger zone — distinct tinted band so the destructive action stands out
    dangerZone: {
        marginTop: 28,
        borderRadius: 18,
        borderWidth: 1,
        padding: 16,
    },
    dangerLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: 11,
        letterSpacing: 1.4,
        marginBottom: 6,
    },
    dangerHint: { fontFamily: 'Geist-Regular', fontSize: 12, lineHeight: 17, marginBottom: 14 },
    deleteBtn: {
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteText: { fontFamily: 'Geist-SemiBold', fontSize: 15, color: '#fff' },
    deleteErrorText: {
        fontFamily: 'Geist-Medium',
        fontSize: 12,
        lineHeight: 16,
        marginTop: 4,
    },
    deleteInput: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontFamily: 'Geist-Medium',
        fontSize: 15,
        marginTop: 14,
    },
});
