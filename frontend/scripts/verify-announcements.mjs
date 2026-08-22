/**
 * verify-announcements — unit tests for the News modal's pure helpers
 * (lib/announcements.ts): the per-field language fallback, the link guard, and the
 * date split.
 *
 * The link guard is the reason this file exists. Announcement rows are hand-written
 * INSERTs in the Supabase dashboard with nothing but a CHECK on link_type in front of
 * them, and the resulting button ships to phones that cannot be patched. Every
 * malformed value a person can type has to end as "no link rendered", never as a
 * crash or a dead end.
 *
 * Run: node scripts/verify-announcements.mjs
 */
import { readFileSync } from 'node:fs';

import {
    pickLocalized,
    resolveAnnouncementLink,
    splitPublishedAt,
    INTERNAL_LINK_ROUTES,
    MONTH_KEYS,
} from '../lib/announcements.ts';

let failures = 0;

function assert(label, condition, detail = '') {
    if (condition) console.log(`  ok  ${label}`);
    else { failures++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

const eq = (label, actual, expected) =>
    assert(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

console.log('\nLanguage pick — pt-BR when present, English when not, PER FIELD');
{
    eq('en reads English', pickLocalized('Hello', 'Olá', 'en'), 'Hello');
    eq('pt-BR reads Portuguese', pickLocalized('Hello', 'Olá', 'pt-BR'), 'Olá');

    // The whole point of the nullable pt columns: a row can be published before it is
    // translated, and it must still read correctly in Portuguese.
    eq('pt-BR with a null translation falls back to English',
        pickLocalized('Hello', null, 'pt-BR'), 'Hello');
    eq('pt-BR with an undefined translation falls back',
        pickLocalized('Hello', undefined, 'pt-BR'), 'Hello');

    // '' is what the dashboard's table editor leaves behind when you click into a
    // cell and back out. Rendering it would be a blank heading.
    eq('an empty-string translation falls back, it does not render blank',
        pickLocalized('Hello', '', 'pt-BR'), 'Hello');
    eq('a whitespace-only translation falls back',
        pickLocalized('Hello', '   \n ', 'pt-BR'), 'Hello');

    // Per FIELD, not per row: a translated title over an untranslated body is better
    // than throwing the translation away.
    eq('half-translated row keeps the half it has (title)',
        pickLocalized('New series', 'Nova série', 'pt-BR'), 'Nova série');
    eq('half-translated row falls back on the other half (body)',
        pickLocalized('Watch it now.', null, 'pt-BR'), 'Watch it now.');

    // detectDeviceLanguage maps every pt* device to pt-BR before i18next sees it, but
    // the helper takes the language as a string and must not be brittle about it.
    eq('any pt* tag counts as Portuguese', pickLocalized('Hi', 'Oi', 'pt'), 'Oi');
    eq('an unknown language reads English', pickLocalized('Hi', 'Oi', 'fr'), 'Hi');

    eq('a null English value degrades to empty, never to "null"',
        pickLocalized(null, null, 'en'), '');
}

console.log('\nLinks — no link_type means no link');
{
    const none = t => resolveAnnouncementLink(t);
    assert('null link_type ⇒ null', none({ link_type: null, link_target: 'https://x.com' }) === null);
    assert('empty link_type ⇒ null', none({ link_type: '', link_target: 'https://x.com' }) === null);
    assert('missing keys entirely ⇒ null', none({}) === null);
    assert('a type with no target ⇒ null', none({ link_type: 'external', link_target: null }) === null);
    assert('a target that is only whitespace ⇒ null',
        none({ link_type: 'external', link_target: '   ' }) === null);
    assert('an unrecognised link_type ⇒ null',
        none({ link_type: 'externsl', link_target: 'https://x.com' }) === null);
}

console.log('\nExternal links');
{
    const ext = target => resolveAnnouncementLink({ link_type: 'external', link_target: target });

    assert('https passes', ext('https://dollarseeds.netlify.app/terms')?.kind === 'external');
    assert('http passes', ext('http://example.com')?.kind === 'external');
    assert('link_type is matched case-insensitively',
        resolveAnnouncementLink({ link_type: 'External', link_target: 'https://x.com' })?.kind === 'external');
    assert('surrounding whitespace is trimmed',
        ext('  https://example.com  ')?.target === 'https://example.com');

    // The typo cases.
    assert('a bare domain with no scheme ⇒ null', ext('dollarseeds.app') === null);
    assert('a scheme with nothing after it ⇒ null', ext('https://') === null);
    assert('an expo-router path typed as external ⇒ null', ext('/lessonSeries/abc') === null);

    // The one that actually matters: a scheme that executes rather than navigates.
    for (const scheme of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
        assert(`${scheme.split(':')[0]}: is refused`, ext(scheme) === null);
    }
}

console.log('\nInternal links');
{
    const int = target => resolveAnnouncementLink({ link_type: 'internal', link_target: target });

    assert('a series deep link passes',
        int('/lessonSeries/8f14e45f-ceea-467a-9c1b-3a1f7e2c9b40')?.kind === 'internal');
    assert('a tab route passes', int('/(tabs)/lessons')?.kind === 'internal');
    assert('a bare allowed route passes', int('/settings')?.kind === 'internal');
    assert('a query string is allowed', int('/details?category=Needs')?.kind === 'internal');
    assert('a trailing slash is allowed', int('/settings/')?.kind === 'internal');
    assert('a dynamic route WITHOUT its id ⇒ null (bare /lessonSeries is not a screen)',
        int('/lessonSeries') === null);
    assert('a dynamic route with only a slash ⇒ null', int('/lessonSeries/') === null);
    assert('a static route with an extra segment ⇒ null', int('/settings/profile') === null);

    // Every route the guard accepts must still exist in app/. The list is checked
    // against the filesystem at the bottom of this file.
    assert('the allowlist is non-empty', INTERNAL_LINK_ROUTES.length > 0);

    // The typo cases, and the ones that only look internal.
    assert('a missing leading slash ⇒ null', int('lessonSeries/abc') === null);
    assert('a route that does not exist ⇒ null', int('/lessonSeriez/abc') === null);
    assert('a route that is a prefix of nothing ⇒ null', int('/nope') === null);
    assert('an external url typed as internal ⇒ null', int('https://example.com') === null);
    assert('a protocol-relative url ⇒ null', int('//evil.example.com') === null);
    assert('a traversal attempt ⇒ null', int('/settings/../../etc') === null);
    // '/' must NOT be in the allowlist: it would match every path that starts with a
    // slash and silently disable the guard. Link to '/(tabs)' for the dashboard.
    assert('the bare root is refused', int('/') === null);

    // A prefix must match a whole segment: /settingsx is not /settings.
    assert('a route that merely starts with an allowed one ⇒ null', int('/settingsx') === null);
}

console.log('\nDate split — never "Invalid Date" on screen');
{
    const d = splitPublishedAt('2026-08-22T15:30:00+00:00');
    assert('a real timestamp splits into month/day/year', !!d);
    assert('the month is a canonical English name the catalogue can key on',
        !!d && MONTH_KEYS.includes(d.month), d && d.month);
    assert('the year survives', !!d && d.year === 2026);

    assert('null ⇒ null (the modal then omits the date line)', splitPublishedAt(null) === null);
    assert('undefined ⇒ null', splitPublishedAt(undefined) === null);
    assert('garbage ⇒ null', splitPublishedAt('not a date') === null);
    assert('an empty string ⇒ null', splitPublishedAt('') === null);
}

console.log('\nThe two lists that could drift');
{
    // MONTH_KEYS is duplicated in lib/announcements.ts so the module stays import-free
    // (node runs it directly). That duplication is only safe if something checks it.
    const months = readFileSync('constants/months.ts', 'utf8');
    for (const m of MONTH_KEYS) {
        assert(`constants/months.ts still contains "${m}"`, months.includes(`'${m}'`) || months.includes(`"${m}"`));
    }
    assert('there are twelve of them', MONTH_KEYS.length === 12);

    // An allowlist entry pointing at a screen that no longer exists is a link that
    // passes the guard and then dead-ends — the exact failure the guard exists to stop.
    const { existsSync } = await import('node:fs');
    for (const route of INTERNAL_LINK_ROUTES) {
        const base = `app${route.replace(/\/$/, '')}`;
        const found = ['.tsx', '.jsx', '/index.tsx', '/[id].tsx', '/_layout.tsx']
            .some(suffix => existsSync(`${base}${suffix}`)) || existsSync(base);
        assert(`the route "${route}" still exists under app/`, found);
        // A dynamic entry must actually BE dynamic, or the trailing slash is a lie
        // and the guard would reject the only form of it that works.
        if (route.endsWith('/')) {
            assert(`"${route}" is genuinely dynamic ([id].tsx)`, existsSync(`${base}/[id].tsx`));
        }
    }
}

console.log(
    failures
        ? `\n✖ ${failures} failing assertion(s)`
        : '\n✔ announcement helpers: all assertions passed',
);
process.exit(failures ? 1 : 0);
