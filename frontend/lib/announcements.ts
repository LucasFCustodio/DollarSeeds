/**
 * announcements — the pure part of the News modal: picking a language, and deciding
 * whether a link the author typed into the SQL editor is safe to render.
 *
 * Dependency-free on purpose, like lib/goalRate.ts, so it can be unit-tested outside
 * React Native — `npm run verify-announcements`. Everything that touches the network,
 * storage or navigation lives in context/AnnouncementsContext.tsx and the modal.
 *
 * ── THE THREAT MODEL IS A TYPO, NOT AN ATTACKER ───────────────────────────────
 * Announcement rows are hand-written INSERTs in the Supabase dashboard. Nothing
 * validates them but the CHECK on link_type and this file. A `link_target` of
 * `/lessonSeries` with no id, or `lessonSeries/abc` with no leading slash, or a plain
 * `dollarseeds.app` with no scheme, are all things a person types at midnight — and
 * every one of them has to end as "the modal renders without a link button", never as
 * a crash on a phone that cannot be patched.
 */

/** One row of GET /announcements/, exactly as the backend serves it. */
export type Announcement = {
    id: string;
    title: string;
    body: string;
    title_pt: string | null;
    body_pt: string | null;
    image_url: string | null;
    link_type: string | null;
    link_target: string | null;
    link_label: string | null;
    author: string;
    published_at: string;
};

/**
 * Announcement CONTENT is deliberately outside the i18n catalogues — it is authored
 * in the database, not shipped in the binary (.claude/docs/i18n.md covers why
 * server-supplied content is its own category). So the language pick happens here.
 *
 * Falls back PER FIELD, not per row: a row with `title_pt` filled and `body_pt` still
 * null renders a Portuguese heading over English text, which is strictly better than
 * throwing away a translation because the other half is missing.
 *
 * An empty or whitespace-only string counts as missing. `''` is what you get from
 * clicking out of an empty cell in the dashboard's table editor, and it must not
 * render as a blank heading.
 */
export function pickLocalized(
    english: string | null | undefined,
    portuguese: string | null | undefined,
    language: string,
): string {
    const isPtBr = language.toLowerCase().startsWith('pt');
    if (isPtBr && typeof portuguese === 'string' && portuguese.trim()) return portuguese;
    return typeof english === 'string' ? english : '';
}

/**
 * Route prefixes an internal link may target.
 *
 * An ALLOWLIST rather than a shape check, because expo-router has no `+not-found`
 * screen in this app: pushing a path that matches no route logs a warning and leaves
 * the user on a blank screen with no way back. Publishing an announcement needs no
 * app update — but DEEP-LINKING to a screen that does not exist in the installed
 * binary was never possible anyway, so constraining it to the screens that do exist
 * costs nothing and removes the whole failure mode.
 *
 * An entry ENDING IN '/' is a dynamic route and requires at least one more segment:
 * `/lessonSeries` on its own is a directory holding only `[id].tsx`, so pushing it
 * bare dead-ends exactly like a route that does not exist. Every other entry matches
 * EXACTLY — `/settings/anything` is not a screen either.
 *
 * '/' is deliberately absent. Adding it would make every path starting with a slash
 * match and quietly disable the whole allowlist; link to '/(tabs)' for the dashboard.
 *
 * Keep in step with app/ when a screen is added — verify-announcements.mjs checks
 * every entry here still resolves to a file.
 */
export const INTERNAL_LINK_ROUTES = [
    '/(tabs)',
    '/(tabs)/transactions',
    '/(tabs)/piggyBank',
    '/(tabs)/lessons',
    '/lessonSeries/',
    '/lessonDetail',
    '/lessonPlayer',
    '/details',
    '/settings',
] as const;

/** An external link must be a real absolute http(s) URL — nothing else opens. */
function isSafeExternal(target: string): boolean {
    // Deliberately not `new URL()`: it accepts `javascript:` and every other scheme,
    // and it is the scheme we care about, not the parse.
    if (!/^https?:\/\//i.test(target)) return false;
    // Something has to follow the scheme.
    return target.replace(/^https?:\/\//i, '').trim().length > 0;
}

function isSafeInternal(target: string): boolean {
    if (!target.startsWith('/')) return false;
    // `//host` is protocol-relative — an EXTERNAL url wearing an internal shape.
    if (target.startsWith('//')) return false;
    if (target.includes('..')) return false;
    // Strip the query/fragment before matching, so `/details?category=Needs` counts.
    const path = target.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    return INTERNAL_LINK_ROUTES.some(route =>
        route.endsWith('/')
            // Dynamic: must have a non-empty segment after the prefix.
            ? path.startsWith(route) && path.length > route.length
            : path === route);
}

export type AnnouncementLink =
    | { kind: 'external'; target: string }
    | { kind: 'internal'; target: string };

/**
 * The link to render, or null for "render no link".
 *
 * Null covers every one of: link_type null (the documented no-link case), an
 * unrecognised link_type, a missing target, and a target that fails its shape check.
 * They collapse together on purpose — the user is not the author, and a broken button
 * is worse for them than no button.
 */
export function resolveAnnouncementLink(a: {
    link_type?: string | null;
    link_target?: string | null;
}): AnnouncementLink | null {
    const type = (a.link_type ?? '').trim().toLowerCase();
    const target = (a.link_target ?? '').trim();
    if (!type || !target) return null;

    if (type === 'external') return isSafeExternal(target) ? { kind: 'external', target } : null;
    if (type === 'internal') return isSafeInternal(target) ? { kind: 'internal', target } : null;
    return null;
}

/**
 * Splits an ISO `published_at` into the pieces LocaleContext's formatters take.
 * Returns null when the timestamp is unparseable, and the modal then omits the date
 * line rather than printing "Invalid Date".
 *
 * MONTH_KEYS is the canonical English month list — the same values every other date
 * in the app is keyed by (see constants/months.ts). This module stays import-free, so
 * it repeats the list rather than importing it; verify-announcements.mjs asserts the
 * two agree, which is the part that could actually drift.
 */
export const MONTH_KEYS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export function splitPublishedAt(
    iso: string | null | undefined,
): { month: string; day: number; year: number } | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return { month: MONTH_KEYS[d.getMonth()], day: d.getDate(), year: d.getFullYear() };
}
