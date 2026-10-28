/**
 * StepLayout — one onboarding screen: Benny and his bubble, the title and subtitle,
 * the screen's content, and a footer pinned to the bottom with the ONE primary
 * button and any small text-link skips under it.
 *
 * The step components (HeartSteps, MonthSteps, HarvestSteps, GardenSteps) all render
 * through this, so the layout never differs between screens.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import type { Answers, Mode } from '../../lib/onboardingFlow';
import type { PlanPreview } from '../../lib/onboardingApi';
import Benny, { StepTitle, type Pose } from './Benny';

/** What every step component receives from app/onboarding.tsx. */
export interface StepProps {
    a: Answers;
    set: (patch: Partial<Answers>) => void;
    /** Complete this step and go to the next one. */
    next: () => void;
    /** The name Benny uses: the answer, the account's, or "friend". */
    name: string;
    mode: Mode;
    /** The month split to show: the preview's, or the account's real one. */
    split: PlanPreview['split'] | null;
    preview: PlanPreview | null;
    /** True while the step's writes (signed in) or the preview are in flight. */
    busy: boolean;
    /** The screen was reached going forward (not by the back arrow or a relaunch). */
    forward: boolean;
    /** The plan's writes failed: sign-up shows the kind error and Try again in place. */
    saveError: boolean;
    onRetry: () => void;
}

/**
 * At most two of bubble / `title` / `subtitle` per screen (ONBOARDING_FIXES.md §1); the
 * goal preview is the one screen allowed all three. `lead` is the short bold question
 * that starts the subtitle once an answer is picked. `pinBenny` keeps Benny and his
 * bubble above the scroll, for a long form.
 */
export default function StepLayout({ pose, bubble, title, subtitle, lead, children, footer, pinBenny = false, overlay, ownHeading = false }: {
    pose: Pose;
    /** The screen draws its own heading in its content (a heading with a bold date):
     *  the bubble keeps the bubble + heading size. */
    ownHeading?: boolean;
    bubble: string;
    title?: string;
    subtitle?: string;
    lead?: string;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    pinBenny?: boolean;
    /** Drawn over the whole screen, untouchable (the plan's confetti). */
    overlay?: React.ReactNode;
}) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const benny = <Benny pose={pose} text={bubble} large={!title && !ownHeading} />;
    return (
        <View style={styles.fill}>
            {pinBenny ? <View style={styles.pinned}>{benny}</View> : null}
            <ScrollView
                style={styles.fill}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {pinBenny ? null : benny}
                <StepTitle title={title} subtitle={subtitle} lead={lead} />
                {children}
            </ScrollView>
            {footer ? (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4, backgroundColor: theme.bg, borderTopColor: theme.borderSoft }]}>
                    {footer}
                </View>
            ) : null}
            {overlay ? <View style={StyleSheet.absoluteFill} pointerEvents="none">{overlay}</View> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    // Generous bottom room, so the last line (the split's note on a small phone)
    // scrolls fully clear of the footer's button.
    body: { paddingHorizontal: 20, paddingBottom: 56, gap: 10 },
    pinned: { paddingHorizontal: 20 },
    footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
