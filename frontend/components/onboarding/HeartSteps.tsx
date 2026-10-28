/**
 * Before the progress bar (screens 1–2) and Group 1 · Your Heart (screens 3–6).
 *
 * Question screens never show a heading (ONBOARDING_FIXES.md §1): before an answer the
 * bubble asks and the subtitle explains; after one, the bubble is Benny's reaction and
 * the short question leads the subtitle in bold.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { FEELINGS, NAME_MAX, REASONS, stepAnswered, type Reason, type TitheChoice } from '../../lib/onboardingFlow';
import { titheRateIssue } from '../../lib/titheRule';
import CardIcon from './cardIcons';
import { Field, PrimaryButton, TapCard, TextLink } from './controls';
import StepLayout, { type StepProps } from './StepLayout';

export function WelcomeStep({ next, onHaveAccount, mode }: StepProps & { onHaveAccount: () => void }) {
    const { t } = useTranslation('onboarding');
    return (
        <StepLayout
            pose="waving"
            bubble={t('welcome.bubble')}
            footer={<>
                <PrimaryButton label={t('welcome.button')} onPress={next} />
                {/* Signed in, there is no other account to go to. */}
                {mode === 'new' ? <TextLink label={t('welcome.haveAccount')} onPress={onHaveAccount} /> : null}
            </>}
        />
    );
}

export function PromiseStep({ next }: StepProps) {
    const { t } = useTranslation('onboarding');
    return (
        <StepLayout
            pose="listening"
            bubble={t('promise.bubble')}
            subtitle={t('promise.subtitle')}
            footer={<PrimaryButton label={t('promise.button')} onPress={next} />}
        />
    );
}

export function NameStep({ a, set, next }: StepProps) {
    const { t } = useTranslation('onboarding');
    const [value, setValue] = useState(a.name ?? '');
    const valid = value.trim().length > 0;
    const go = () => { if (!valid) return; set({ name: value.trim() }); next(); };
    return (
        <StepLayout
            pose="curious"
            bubble={valid && a.name === value.trim() ? t('name.reaction', { name: value.trim() }) : t('name.question')}
            footer={<PrimaryButton label={t('name.button')} onPress={go} disabled={!valid} />}
        >
            <Field
                accessibilityLabel={t('name.question')}
                value={value}
                onChangeText={setValue}
                validate={v => (v.trim() ? null : t('name.errEmpty'))}
                placeholder={t('name.placeholder')}
                autoFocus={!a.name}
                textContentType="givenName"
                autoComplete="name-given"
                autoCapitalize="words"
                maxLength={NAME_MAX}
                returnKeyType="done"
                onSubmitEditing={go}
            />
        </StepLayout>
    );
}

export function ReasonsStep({ a, set, next, name }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    const picked = a.reasons ?? [];
    const [last, setLast] = useState<Reason | null>(null);
    const toggle = (r: Reason) => {
        const on = picked.includes(r);
        const nextPicked = on ? picked.filter(x => x !== r) : REASONS.filter(x => x === r || picked.includes(x));
        set({ reasons: nextPicked });
        setLast(on ? null : r);
    };
    const reaction = picked.length === 0 ? null
        : last ? t(`reasons.reaction.${last}`)
        : picked.length > 1 ? t('reasons.reaction.many') : t(`reasons.reaction.${picked[0]}`);
    return (
        <StepLayout
            pose="curious"
            bubble={reaction ?? t('reasons.question', { name })}
            lead={reaction ? t('reasons.short') : undefined}
            subtitle={t('reasons.subtitle')}
            footer={<PrimaryButton label={t('reasons.button')} onPress={next} disabled={!stepAnswered('reasons', a)} />}
        >
            {REASONS.map(r => (
                <TapCard
                    key={r}
                    multi
                    label={t(`reasons.options.${r}`)}
                    icon={<CardIcon name={r} color={theme.brand} soft={theme.goalsSoft} />}
                    selected={picked.includes(r)}
                    onPress={() => toggle(r)}
                />
            ))}
        </StepLayout>
    );
}

export function FeelingStep({ a, set, next }: StepProps) {
    const { t } = useTranslation('onboarding');
    const { theme } = useTheme();
    return (
        <StepLayout
            pose="gentle"
            bubble={a.feeling ? t(`feeling.reaction.${a.feeling}`) : t('feeling.question')}
            lead={a.feeling ? t('feeling.short') : undefined}
            subtitle={t('feeling.subtitle')}
            footer={<PrimaryButton label={t('chrome.continue')} onPress={next} disabled={!a.feeling} />}
        >
            {FEELINGS.map(f => (
                <TapCard
                    key={f}
                    label={t(`feeling.options.${f}`)}
                    icon={<CardIcon name={f} color={theme.brand} soft={theme.harvestSoft} />}
                    selected={a.feeling === f}
                    onPress={() => set({ feeling: f })}
                />
            ))}
        </StepLayout>
    );
}

const TITHE_CHOICES: TitheChoice[] = ['ten', 'custom', 'none'];

export function TitheStep({ a, set, next }: StepProps) {
    const { t } = useTranslation(['onboarding', 'common']);
    const { theme } = useTheme();
    const { parseAmount } = useLocale();
    const choice = a.tithe?.choice;
    const [pct, setPct] = useState(a.tithe?.ratePct != null ? String(a.tithe.ratePct) : '');
    const parse = (v: string) => (v.trim() ? parseAmount(v) : null);
    const pick = (c: TitheChoice) => set({ tithe: c === 'custom' ? { choice: c, ratePct: parse(pct) ?? undefined } : { choice: c } });
    // A whole percentage from 10 to 100 (lib/titheRule.ts). Checked when the field
    // loses focus; "Let's keep going" stays disabled until it holds.
    const pctError = (v: string) => {
        const issue = titheRateIssue(parse(v));
        return issue === null ? null : t(`common:titheRate.${issue === 'empty' ? 'whole' : issue}`);
    };
    return (
        <StepLayout
            pose="bible"
            bubble={choice ? t(`onboarding:tithe.reaction.${choice}`) : t('onboarding:tithe.question')}
            lead={choice ? t('onboarding:tithe.short') : undefined}
            subtitle={t('onboarding:tithe.subtitle')}
            footer={<PrimaryButton label={t('onboarding:tithe.button')} onPress={next} disabled={!stepAnswered('tithe', a)} />}
        >
            {TITHE_CHOICES.map(c => (
                <TapCard
                    key={c}
                    label={t(`onboarding:tithe.options.${c}`)}
                    icon={<CardIcon name={c} color={theme.brand} soft={theme.brandSoft} />}
                    selected={choice === c}
                    onPress={() => pick(c)}
                />
            ))}
            {choice === 'custom' ? (
                <Field
                    label={t('onboarding:tithe.customLabel')}
                    value={pct}
                    onChangeText={v => { setPct(v); set({ tithe: { choice: 'custom', ratePct: parse(v) ?? undefined } }); }}
                    validate={pctError}
                    keyboardType="number-pad"
                    placeholder="12"
                    maxLength={3}
                    autoFocus={!a.tithe?.ratePct}
                />
            ) : null}
        </StepLayout>
    );
}
