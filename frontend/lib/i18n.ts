/**
 * i18n.ts — i18next setup.
 *
 * Adding a language is: create `locales/<tag>/`, copy the JSON files, translate them,
 * and add the tag to SUPPORTED_LANGUAGES. Nothing else in the app changes.
 *
 * ── WHY i18next IS PINNED TO v23 ──────────────────────────────────────────────
 * v24+ removed `compatibilityJSON` and depends unconditionally on `Intl.PluralRules`.
 * Hermes' Intl coverage varies by platform and build, and `Intl.PluralRules` is the
 * least reliably present part of it — a gap that surfaces only in a release build, as
 * either a crash or (worse) silently wrong plurals. v23 keeps a non-Intl plural path.
 *
 * We set `compatibilityJSON: 'v3'` EXPLICITLY rather than relying on v23's auto-detect,
 * because the fallback changes the expected key format: v3 wants `key` / `key_plural`,
 * v4 wants `key_one` / `key_other`. Authoring for one and silently getting the other
 * breaks every plural. Pinning the format makes it deterministic on every engine.
 *
 * Do not bump the major without either polyfilling `Intl.PluralRules` or verifying it
 * on a RELEASE build on both platforms.
 * ──────────────────────────────────────────────────────────────────────────────
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from '../locales/en';
import ptBR from '../locales/pt-BR';

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR'] as const;
export type LanguageTag = typeof SUPPORTED_LANGUAGES[number];

export const DEFAULT_LANGUAGE: LanguageTag = 'en';

export function isLanguageTag(value: unknown): value is LanguageTag {
    return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * What the device says, narrowed to something we actually ship.
 *
 * `getLocales()` returns tags like `pt-BR`, `pt-PT`, `pt`, `pt-AO`, `en-GB`. We match
 * on the LANGUAGE part, so every Portuguese-speaking device gets pt-BR rather than
 * falling through to English — a `pt-PT` user reading Brazilian Portuguese is a far
 * better outcome than a Portuguese speaker reading English.
 */
export function detectDeviceLanguage(): LanguageTag {
    try {
        for (const locale of getLocales()) {
            const tag = locale.languageTag;
            if (isLanguageTag(tag)) return tag;
            const base = (locale.languageCode ?? tag ?? '').toLowerCase();
            const match = SUPPORTED_LANGUAGES.find(l => l.toLowerCase().split('-')[0] === base);
            if (match) return match;
        }
    } catch {
        // getLocales() should never throw, but a locale lookup must not stop the app
        // from starting.
    }
    return DEFAULT_LANGUAGE;
}

/** The device's currency hint, used only as a first-run default. */
export function detectDeviceCurrency(): string | null {
    try {
        return getLocales()[0]?.currencyCode ?? null;
    } catch {
        return null;
    }
}

export const resources = {
    en,
    'pt-BR': ptBR,
} as const;

export function initI18n(language: LanguageTag) {
    if (i18n.isInitialized) return i18n;

    i18n.use(initReactI18next).init({
        resources,
        lng: language,
        fallbackLng: DEFAULT_LANGUAGE,
        supportedLngs: [...SUPPORTED_LANGUAGES],
        // A pt-PT / pt-AO device resolves to pt-BR instead of English.
        nonExplicitSupportedLngs: true,
        // Without this, i18next normalises to `pt-br` and hunts for a folder that
        // doesn't exist — every Brazilian user would silently get English.
        lowerCaseLng: false,
        load: 'currentOnly',
        compatibilityJSON: 'v3',
        defaultNS: 'common',
        ns: Object.keys(en),
        interpolation: {
            // React already escapes everything it renders.
            escapeValue: false,
        },
        returnNull: false,
        // A missing key is a bug, not a runtime condition. Loud in development,
        // silent (falls back to English, then to the key) in production.
        saveMissing: __DEV__,
        missingKeyHandler: (_lngs, ns, key) => {
            if (__DEV__) console.error(`[i18n] missing key: ${ns}:${key}`);
        },
    });

    return i18n;
}

export default i18n;
