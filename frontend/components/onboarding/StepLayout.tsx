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
}

export default function StepLayout({ pose, bubble, title, subtitle, children, footer }: {
    pose: Pose;
    bubble: string;
    title?: string;
    subtitle?: string;
    children?: React.ReactNode;
    footer?: React.ReactNode;
}) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    return (
        <View style={styles.fill}>
            <ScrollView
                style={styles.fill}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Benny pose={pose} text={bubble} />
                <StepTitle title={title} subtitle={subtitle} />
                {children}
            </ScrollView>
            {footer ? (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4, backgroundColor: theme.bg, borderTopColor: theme.borderSoft }]}>
                    {footer}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    body: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
    footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
