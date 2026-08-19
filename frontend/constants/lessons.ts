/**
 * Written lessons — structure only. The prose lives in the catalogue.
 *
 * `id` is a STORED value: it is the AsyncStorage 'completed_lessons' entry and the
 * `lesson_id` posted to /lesson-ratings/, so it is numeric and permanent. `key` is
 * the catalogue path under `lessons:written.<key>`, and `sectionCount` is how many
 * `sections.<n>` entries that lesson has — the screen iterates it rather than reading
 * an array out of i18next, which keeps every string individually key-checkable.
 *
 * Adding a lesson: append here, add `lessons:written.<key>` to EVERY locale. The
 * parity check in scripts/check-locales.mjs fails if a locale is missed.
 */

export type LessonMeta = {
    /** Stored identity — AsyncStorage completion flag and the ratings API. Never reuse. */
    id: number;
    /** Catalogue path under `lessons:written`. */
    key: string;
    /** Estimated reading time in minutes. Rendered through `lessons:minutes`. */
    minutes: number;
    /** How many `sections.<n>.heading` / `.body` pairs the catalogue holds. */
    sectionCount: number;
};

export const LESSONS: LessonMeta[] = [
    { id: 1, key: 'ants',  minutes: 6, sectionCount: 3 },
    { id: 2, key: 'widow', minutes: 7, sectionCount: 2 },
];

export const findLesson = (id: number | string): LessonMeta | undefined =>
    LESSONS.find(l => l.id === Number(id));
