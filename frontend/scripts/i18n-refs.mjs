/**
 * i18n-refs — every translation key the SOURCE looks up, with the namespace(s) it will
 * be looked up in. Shared by check-locales (does the key exist there?) and verify-i18n
 * (does real i18next resolve it to text in every language?).
 *
 * Why it exists: every other check starts from the CATALOGUE — parity, placeholders,
 * values left hardcoded, keys nothing references. None starts from the CODE, so a call
 * like t('tutorial.sampleName') whose key is missing, misspelled, or present under a
 * different namespace than the one the component's useTranslation names passes all of
 * them and renders on screen as the raw key. (check-locales' "unreferenced" check even
 * counts such a key as referenced, because it searches for the key's text anywhere.)
 *
 * What it understands — the patterns this codebase uses:
 *   const { t } = useTranslation('ns')            → t('key') looks in ns
 *   const { t: tc } = useTranslation('common')     → tc('key') looks in common
 *   const { t } = useTranslation(['a', 'b'])       → t('key') looks in a, then b
 *   const { t } = useTranslation()                 → defaultNS, `common`
 *   t('ns:key')                                    → an explicit namespace wins
 *   t(`group.${x}.title`)                          → a DYNAMIC ref: its static prefix
 *   i18n.t('ns:key'), i18next.t(...)               → defaultNS unless prefixed
 *   getFixedT('en', 'ns')('key')                   → ns
 *   <Trans i18nKey="ns:key" />                     → defaultNS unless prefixed
 *
 *   (t: TFunction<'ns'>) => t('key')               → ns, from the type
 *
 * A call is bound to the NEAREST PRECEDING binding of the same name in the file, which
 * is how components here are written (the hook at the top of each function). A call
 * with no binding in the file — an untyped `t` passed in — is skipped rather than
 * guessed at.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export const DEFAULT_NS = 'common';
export const SOURCE_DIRS = ['app', 'components', 'constants', 'context', 'hooks', 'lib'];

export function flatten(obj, prefix = '', out = {}) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
        else out[key] = v;
    }
    return out;
}

function walk(dir, files = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, files);
        else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry))) files.push(full);
    }
    return files;
}

export function readSources(dirs = SOURCE_DIRS) {
    return dirs.flatMap(d => {
        try { return walk(d); } catch { return []; }
    }).map(file => ({ file, text: readFileSync(file, 'utf8') }));
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** A line that is only a comment can mention t('…') in prose. */
function inComment(text, index) {
    const start = text.lastIndexOf('\n', index - 1) + 1;
    const before = text.slice(start, index);
    return /^\s*(\{\s*)?(\/\/|\/\*|\*)/.test(before) || before.includes('//');
}

/** The namespaces a useTranslation(...) argument names; null when not literal. */
function parseNsArg(arg) {
    const a = arg.trim();
    if (!a) return [DEFAULT_NS];
    const one = a.match(/^(['"])([\w-]+)\1$/);
    if (one) return [one[2]];
    if (a.startsWith('[')) {
        const list = [...a.matchAll(/(['"])([\w-]+)\1/g)].map(m => m[2]);
        return list.length ? list : null;
    }
    return null;
}

/** `ns:key` → [ns, key] when ns is a known namespace; otherwise [null, key]. */
function splitNs(raw, namespaces) {
    const m = raw.match(/^([\w-]+):(.+)$/);
    return m && namespaces.includes(m[1]) ? [m[1], m[2]] : [null, raw];
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every lookup in one file: { file, line, nsList, key, dynamic }. `dynamic` refs carry
 * the static part before `${…}` as `key`; an empty prefix is dropped (nothing to check).
 */
export function extractRefs(file, text, namespaces) {
    const refs = [];
    const push = (index, nsList, raw, quote) => {
        if (inComment(text, index)) return;
        const dynamic = quote === '`' && raw.includes('${');
        let body = dynamic ? raw.slice(0, raw.indexOf('${')) : raw;
        const [ns, key] = splitNs(body, namespaces);
        if (dynamic && !key) return;
        refs.push({ file, line: lineOf(text, index), nsList: ns ? [ns] : nsList, key, dynamic });
    };

    // useTranslation bindings, by alias, in source order.
    const bindings = [];
    for (const m of text.matchAll(/const\s*\{([^}]*)\}\s*=\s*useTranslation\(([^)]*)\)/g)) {
        const nsList = parseNsArg(m[2]);
        for (const part of m[1].split(',')) {
            const [name, alias] = part.split(':').map(s => s.trim());
            if (name === 't') bindings.push({ alias: alias || 't', nsList, index: m.index });
        }
    }
    // A `t` received as a parameter typed TFunction<'ns'> (lib/serverStrings.ts) names
    // its namespace in the type, so the declaration counts as a binding.
    for (const m of text.matchAll(/TFunction<\s*(['"])([\w-]+)\1\s*>/g)) {
        bindings.push({ alias: 't', nsList: [m[2]], index: m.index });
    }
    bindings.sort((a, b) => a.index - b.index);
    const QUOTED = '([\'"`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1';

    for (const alias of new Set(bindings.map(b => b.alias))) {
        const re = new RegExp(`(?<![\\w.$])${esc(alias)}\\(\\s*${QUOTED}`, 'g');
        for (const m of text.matchAll(re)) {
            const binding = bindings.filter(b => b.alias === alias && b.index < m.index).pop();
            if (!binding || !binding.nsList) continue;
            push(m.index, binding.nsList, m[2], m[1]);
        }
    }
    for (const m of text.matchAll(new RegExp(`\\bi18n(?:ext)?\\.t\\(\\s*${QUOTED}`, 'g'))) {
        push(m.index, [DEFAULT_NS], m[2], m[1]);
    }
    // getFixedT(lng, 'ns')('key'): groups 1-2 are the namespace, 3-4 the key.
    const fixed = /getFixedT\([^,()]+,\s*(['"])([\w-]+)\1\)\(\s*(['"`])((?:(?!\3)[^\\]|\\.)*)\3/g;
    for (const m of text.matchAll(fixed)) {
        push(m.index, [m[2]], m[4], m[3]);
    }
    for (const m of text.matchAll(/i18nKey=(["'])([^"']+)\1/g)) {
        push(m.index, [DEFAULT_NS], m[2], m[1]);
    }
    return refs;
}

/**
 * Does `key` resolve in one of `nsList`? A leaf, or (returnObjects) a group. A
 * dynamic ref needs at least one key under its static prefix.
 */
export function refResolves(ref, flatByNs) {
    return ref.nsList.some(ns => {
        const flat = flatByNs[ns];
        if (!flat) return false;
        if (ref.dynamic) return Object.keys(flat).some(k => k.startsWith(ref.key));
        return ref.key in flat || Object.keys(flat).some(k => k.startsWith(`${ref.key}.`));
    });
}

/**
 * Self-test, run by check-locales before it trusts the extractor: a missing key and
 * a key under the wrong namespace must both be reported, and correct lookups must
 * not. If the extractor regresses (a regex stops matching), this fails loudly rather
 * than the check quietly passing everything.
 */
export function selfTest() {
    const flatByNs = {
        common: { 'action.cancel': 'Cancel' },
        debts: { 'tutorial.sampleName': 'Credit Card', 'tutorial.a11y.seed': 'Seed', 'type.auto': 'Auto' },
        dashboard: { 'debtTeaser.cta': 'Learn how' },
    };
    const namespaces = Object.keys(flatByNs);
    const src = [
        "function A() {",
        "    const { t } = useTranslation('debts');",
        "    const { t: tc } = useTranslation('common');",
        "    t('tutorial.sampleName'); t(`tutorial.a11y.${k}`); tc('action.cancel');",
        "    t('dashboard:debtTeaser.cta'); t('tutorial.sampelName');",   // typo: missing
        "}",
        "function B() {",
        "    const { t } = useTranslation('dashboard');",
        "    t('tutorial.sampleName');",                                    // wrong namespace
        "    // t('not.a.call') in a comment",
        "}",
    ].join('\n');
    const refs = extractRefs('self-test.tsx', src, namespaces);
    const bad = refs.filter(r => !refResolves(r, flatByNs)).map(r => `${r.line}:${r.key}`);
    const expectBad = ['5:tutorial.sampelName', '9:tutorial.sampleName'];
    const okCount = refs.length - bad.length;
    if (JSON.stringify(bad) !== JSON.stringify(expectBad) || okCount !== 4) {
        throw new Error(`i18n-refs self-test failed: flagged ${JSON.stringify(bad)}, `
            + `expected ${JSON.stringify(expectBad)}; ${okCount} resolved, expected 4`);
    }
}
