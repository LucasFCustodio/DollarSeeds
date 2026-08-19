/**
 * check-locales — the safety net for a hand-maintained catalogue.
 *
 * There is no test runner in the frontend, so this script is the gate. It runs four
 * checks, and each one caught a real live bug during the pt-BR work:
 *
 *  1. KEY PARITY. Every locale must expose exactly the same key set. A key present
 *     in `en` but missing in `pt-BR` silently falls back to English, which looks like
 *     "we forgot to translate that one" rather than a bug — so it never gets found.
 *
 *  2. PLACEHOLDER PARITY. `{{month}}` in English and `{{mes}}` in Portuguese renders
 *     the literal braces on screen. Comparing the SET of placeholders per key catches
 *     typos, omissions, and additions.
 *
 *  3. NO CATALOGUE VALUE LEFT HARDCODED — text is in the catalogue but the screen
 *     still renders the English literal. An earlier pass replaced JSX text nodes with
 *     a single-line `>Text</Text>` pattern, which silently no-oped on every multi-line
 *     node, leaving eight strings translated-but-English. Nothing failed; the app just
 *     stayed in English. Matching whitespace-flexibly is what finds these.
 *
 *  4. NO UNREFERENCED KEY. Check 3 cannot see an INTERPOLATED string, because one
 *     never appears verbatim in source — so a call site assembling `{ratePct}%` by
 *     hand is invisible to it. Coming at it from the other end (a key with no call
 *     site anywhere) closes that gap, and found four more.
 *
 * Checks 3 and 4 are complements: 3 works value-first and misses interpolated keys,
 * 4 works key-first and misses nothing but needs to understand dynamic lookups.
 *
 * Run: node scripts/check-locales.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const LOCALES_DIR = 'locales';
const SOURCE_DIRS = ['app', 'components', 'constants', 'context', 'hooks', 'lib'];
const BASE = 'en';

// ── helpers ───────────────────────────────────────────────────────────────────

function flatten(obj, prefix = '', out = {}) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
        else out[key] = v;
    }
    return out;
}

const readNs = (locale, ns) =>
    JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${ns}.json`), 'utf8'));

const placeholders = str =>
    new Set([...String(str).matchAll(/\{\{\s*([A-Za-z0-9_]+)/g)].map(m => m[1]));

function walk(dir, files = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, files);
        else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry))) files.push(full);
    }
    return files;
}

// ── discover locales and namespaces ───────────────────────────────────────────

const locales = readdirSync(LOCALES_DIR).filter(d =>
    statSync(join(LOCALES_DIR, d)).isDirectory());
const namespaces = readdirSync(join(LOCALES_DIR, BASE))
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''));

const problems = [];
const baseFlat = {};

for (const ns of namespaces) {
    baseFlat[ns] = flatten(readNs(BASE, ns));
}

// ── 1 + 2: parity ─────────────────────────────────────────────────────────────

for (const locale of locales) {
    if (locale === BASE) continue;
    for (const ns of namespaces) {
        let flat;
        try {
            flat = flatten(readNs(locale, ns));
        } catch {
            problems.push(`[missing namespace] ${locale}/${ns}.json does not exist`);
            continue;
        }
        const baseKeys = Object.keys(baseFlat[ns]);
        for (const key of baseKeys) {
            if (!(key in flat)) {
                problems.push(`[missing key] ${locale}/${ns}: ${key}`);
                continue;
            }
            const a = placeholders(baseFlat[ns][key]);
            const b = placeholders(flat[key]);
            const only = [...a].filter(x => !b.has(x));
            const extra = [...b].filter(x => !a.has(x));
            if (only.length || extra.length) {
                problems.push(
                    `[placeholder drift] ${locale}/${ns}: ${key}` +
                    (only.length ? ` — missing {{${only.join('}} {{')}}}` : '') +
                    (extra.length ? ` — unexpected {{${extra.join('}} {{')}}}` : ''));
            }
        }
        for (const key of Object.keys(flat)) {
            if (!(key in baseFlat[ns])) problems.push(`[extra key] ${locale}/${ns}: ${key}`);
        }
    }
}

// ── 3: catalogue values still hardcoded in source ─────────────────────────────

// Values too short or too generic to match meaningfully — a bare "Save" or "AMOUNT"
// appears in style props, keys and comments, so matching them is pure noise.
const SKIP_SHORT = 12;

/**
 * Files that legitimately contain the English text.
 *
 * `lib/serverStrings.ts` matches ON the English the backend emits — those literals
 * ARE the lookup keys, so finding them there is the code working. Everything else
 * on this list is prose still awaiting translation; each entry is a to-do, and
 * removing it once translated is how the check starts protecting that file.
 */
const ALLOW_ENGLISH = new Set([
    'lib/serverStrings.ts',
    // ── still to translate (tracked, not forgotten) ──
    'constants/premium.ts',
    'constants/onboarding.ts',
    'constants/lessons.ts',
    'constants/legal.ts',
    'constants/budgetTypes.ts',
]);

const sources = SOURCE_DIRS.flatMap(d => {
    try { return walk(d); } catch { return []; }
}).map(f => ({
    file: f,
    // Normalise to forward slashes so ALLOW_ENGLISH reads the same on Windows.
    slug: f.split('\\').join('/'),
    text: readFileSync(f, 'utf8'),
}));

/**
 * Two per-line exemptions, both narrow on purpose:
 *
 *  • `i18n-canonical` — the literal is a value that goes ON THE WIRE or into the
 *    DATABASE, so it must stay English in every language. `to_goal_title` is the
 *    example: translating it would write Portuguese into a column the backend and
 *    every already-installed binary read as English.
 *  • a `console.*` call — log text is for us, not for users.
 */
const isExempt = line =>
    line.includes('i18n-canonical') || /console\.(error|warn|log|info|debug)\s*\(/.test(line);

/** A line that is only a comment can hold English prose harmlessly. */
const isComment = line => /^\s*(\{\s*)?(\/\/|\/\*|\*)/.test(line);

/**
 * Whitespace-flexible pattern for one catalogue value.
 *
 * This is the whole reason the check works. A JSX text node wraps across lines and
 * gets re-indented, so `Pick the split that fits your situation. Changes apply to
 * this month and\n     going forward — …` matches NO single-line pattern. Treating
 * every run of whitespace in the value as `\s+` is what finds it — and that node was
 * a live untranslated string this very check surfaced.
 */
const flexible = v =>
    v.trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .split(/\s+/)
        .join('\\s+');

const leaked = [];
for (const { file, slug, text } of sources) {
    if (ALLOW_ENGLISH.has(slug)) continue;
    const lines = text.split('\n');
    // Offset of each line's first character, so a match index maps back to a line.
    const lineStart = [];
    let acc = 0;
    for (const line of lines) { lineStart.push(acc); acc += line.length + 1; }
    const lineAt = idx => {
        let lo = 0, hi = lineStart.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= idx) lo = mid; else hi = mid - 1; }
        return lo;
    };

    for (const ns of namespaces) {
        for (const [key, value] of Object.entries(baseFlat[ns])) {
            const v = String(value);
            // Interpolated strings can't appear verbatim; placeholder-free only.
            if (v.trim().length < SKIP_SHORT || v.includes('{{')) continue;
            const pat = flexible(v);
            // A quoted literal, or a JSX text node — the two forms a missed
            // replacement takes. `locales/` is excluded by SOURCE_DIRS.
            const re = new RegExp(`['"]${pat}['"]|>\\s*${pat}\\s*<`, 'g');
            for (const m of text.matchAll(re)) {
                const i = lineAt(m.index);
                // A multi-line node's exemption may sit on any line it spans.
                const span = lines.slice(i, lineAt(m.index + m[0].length) + 1);
                if (span.some(isExempt) || span.every(isComment)) continue;
                leaked.push(`[hardcoded] ${file}:${i + 1} — ${ns}:${key}`);
            }
        }
    }
}
problems.push(...leaked);

// ── 4: keys nothing references ────────────────────────────────────────────────

/**
 * The blind spot in check 3: it can only match values with no `{{placeholder}}`,
 * because an interpolated string never appears verbatim in source. So an INTERPOLATED
 * key can be fully translated, sit in both catalogues, and still have a call site
 * rendering the English by hand — check 3 sees nothing.
 *
 * `settings:tithing.explain` was exactly that. The catalogue held both languages
 * while settings.tsx still assembled the sentence inline with `{ratePct}%`.
 *
 * Approaching it from the other end catches it: a key that appears in NO source file
 * is either dead or unwired. Both are worth knowing about.
 *
 * The match is on the key's last two segments, because call sites are written as
 * `t('tithing.explain')` or `t('settings:tithing.explain')` or with a template
 * literal like t(`verse.${id}.text`) — so a leaf-only match would be too loose and a
 * full-path match too strict.
 */
const allSource = sources.map(s => s.text).join('\n');

/**
 * Prefixes looked up DYNAMICALLY, harvested from the source rather than hand-listed.
 *
 * Whole groups are addressed by computed key — t(`months.${month}`),
 * t(`verse.${id}.text`), t(`budgetType.${key}.name`) — and a literal search finds
 * none of them. Scanning for the static part before `${` recovers exactly those
 * prefixes, so the groups count as referenced without an allowlist that would go
 * stale the moment a group is renamed.
 */
const dynamicPrefixes = [...allSource.matchAll(/[`'"]([A-Za-z0-9_.:]*?)\$\{/g)]
    .map(m => m[1].replace(/^[a-z]+:/, ''))   // drop any `ns:` qualifier
    .filter(Boolean);

for (const ns of namespaces) {
    for (const key of Object.keys(baseFlat[ns])) {
        if (dynamicPrefixes.some(p => key.startsWith(p))) continue;
        // i18next appends the plural category to the key it looks up, so
        // `series.lessonCount` in source resolves `series.lessonCount_one` /
        // `_other` in the catalogue. Strip the suffix before searching.
        const parts = key.replace(/_(zero|one|two|few|many|other)$/, '').split('.');
        // A single-segment key is too short to search for loosely, so require it
        // quoted or namespace-prefixed. Deeper keys match on a 2- or 3-segment tail.
        const tails = parts.length === 1
            ? [`'${key}'`, `:${key}'`, '`' + key + '`']
            : [parts.slice(-3).join('.'), parts.slice(-2).join('.')];
        if (tails.some(tail => allSource.includes(tail))) continue;
        problems.push(`[unreferenced] ${ns}:${key} — translated but no call site found`);
    }
}

// ── report ────────────────────────────────────────────────────────────────────

const total = Object.values(baseFlat).reduce((n, f) => n + Object.keys(f).length, 0);
if (problems.length) {
    for (const p of problems) console.error(p);
    console.error(`\n✖ ${problems.length} problem(s) across ${locales.length} locales, ${total} keys`);
    process.exit(1);
}
console.log(`✔ ${locales.length} locales · ${namespaces.length} namespaces · ${total} keys · no drift`);
