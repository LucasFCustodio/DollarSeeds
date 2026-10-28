/**
 * onboardingStore — what the onboarding keeps on the phone (ONBOARDING_REWORK.md §1,
 * §2). Three keys:
 *
 *   onboarding_v2_state              DEVICE-level, not per user: the answers, the
 *                                    current step and each write's state. Saved after
 *                                    every step and around every write, so a killed
 *                                    app resumes on the same step with every answer.
 *                                    Cleared once the plan is written and the flow ends.
 *   onboarding_v2_completed_<userId> a fast cache of `user_metadata.
 *                                    onboarding_v2_completed_at`, which is the source
 *                                    of truth (it survives a reinstall or a new phone).
 *   home_plus_hint_<userId>          the home's one-time Benny hint at the + buttons:
 *                                    'pending' after the onboarding, 'seen' after.
 *
 * Every read and write swallows storage errors: losing a cache costs a re-check, and
 * losing the state costs re-answering, but neither may crash or trap the flow.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Answers, Mode, StepId } from './onboardingFlow';
import type { WriteStates } from './onboardingWrites';

const STATE_KEY = 'onboarding_v2_state';
const STATE_VERSION = 1;

export interface SavedOnboarding {
    v: typeof STATE_VERSION;
    step: StepId;
    answers: Answers;
    writes: WriteStates;
    /** The mode the flow started in — analytics' `mode`, kept through sign-up. */
    mode: Mode;
}

export const completedKey = (userId: string) => `onboarding_v2_completed_${userId}`;
export const homeHintKey = (userId: string) => `home_plus_hint_${userId}`;

export async function loadSaved(): Promise<SavedOnboarding | null> {
    try {
        const raw = await AsyncStorage.getItem(STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.v !== STATE_VERSION || typeof parsed.step !== 'string' || typeof parsed.answers !== 'object') return null;
        return { ...parsed, writes: parsed.writes ?? {}, mode: parsed.mode === 'signed_in' ? 'signed_in' : 'new' };
    } catch {
        return null;
    }
}

export async function saveSaved(state: Omit<SavedOnboarding, 'v'>): Promise<void> {
    try {
        await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ v: STATE_VERSION, ...state }));
    } catch (err) {
        console.error('Onboarding state save error:', err);
    }
}

export async function clearSaved(): Promise<void> {
    try { await AsyncStorage.removeItem(STATE_KEY); } catch { /* nothing to lose */ }
}

export async function getFlag(key: string): Promise<string | null> {
    try { return await AsyncStorage.getItem(key); } catch { return null; }
}

export async function setFlag(key: string, value: string): Promise<void> {
    try { await AsyncStorage.setItem(key, value); } catch { /* a cache */ }
}
