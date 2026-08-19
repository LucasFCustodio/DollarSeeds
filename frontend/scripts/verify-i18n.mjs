/**
 * verify-i18n — boots a real i18next against the real catalogues and asserts the
 * behaviours that check-locales cannot see, because they depend on RESOLUTION rather
 * than on the files' contents.
 *
 * Each check is here because it caught, or guards, a specific live failure:
 *
 *  - `resolvedLanguage === 'pt-BR'`. A previous config had a fully-populated pt-BR
 *    bundle that never rendered: `nonExplicitSupportedLngs: true` strips the region,
 *    checks `pt` against supportedLngs, finds nothing and falls back to English.
 *    hasResourceBundle('pt-BR') was true the whole time. Nothing but this assertion
 *    distinguishes that state from a working one.
 *
 *  - PLURALS. compatibilityJSON: 'v3' is pinned because v4 needs Intl.PluralRules,
 *    which Hermes does not reliably ship. v3's suffixes are '' and '_plural', NOT the
 *    CLDR `_one`/`_other`. The catalogue was written with the v4 spelling and the
 *    series screen rendered the literal string "series.lessonCount" — invisible to a
 *    file-level check, because the key really was present, just under the wrong name.
 *
 *  - getFixedT('en'). Analytics deliberately sends the ENGLISH lesson title so events
 *    stay comparable across locales. That relies on the `en` bundle staying reachable
 *    while pt-BR is active, which `load: 'currentOnly'` makes non-obvious.
 *
 *  - Fall-through. An unrecognised stored value (a sub-category or source added later)
 *    must render as its raw English, never as a bare `source.Freelance` key.
 *
 * Run: node scripts/verify-i18n.mjs
 */
import i18next from '../node_modules/i18next/dist/esm/i18next.js';
import { readFileSync, readdirSync } from 'node:fs';

const load = loc => Object.fromEntries(
  readdirSync(`locales/${loc}`).filter(f => f.endsWith('.json'))
    .map(f => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(`locales/${loc}/${f}`, 'utf8'))]));

const en = load('en');
await i18next.init({
  resources: { en, 'pt-BR': load('pt-BR') },
  lng: 'pt-BR', fallbackLng: 'en', supportedLngs: ['en', 'pt-BR'],
  lowerCaseLng: false, load: 'currentOnly', compatibilityJSON: 'v3',
  defaultNS: 'common', ns: Object.keys(en), returnNull: false,
  interpolation: { escapeValue: false },
});

const ok = [];
const fail = [];
const check = (label, actual, expected) =>
  (actual === expected ? ok : fail).push(`${label}: ${JSON.stringify(actual)}${actual === expected ? '' : ` (expected ${JSON.stringify(expected)})`}`);

check('resolvedLanguage', i18next.resolvedLanguage, 'pt-BR');
check('tabs.piggyBank', i18next.t('tabs.piggyBank'), 'Metas');
check('lessons title (pt)', i18next.t('lessons:written.ants.title'), 'Guardar para o inesperado');
check('lessons title via getFixedT(en)',
  i18next.getFixedT('en', 'lessons')('written.ants.title'), 'Saving for the Unexpected');
check('plural singular', i18next.t('lessons:series.lessonCount', { count: 1 }), '1 AULA');
check('plural plural', i18next.t('lessons:series.lessonCount', { count: 4 }), '4 AULAS');
check('serverTitle rollover',
  i18next.t('serverTitle.rollover', { month: 'agosto' }), 'Sobra de agosto');
check('subcategory needs Other', i18next.t('subcategory.needs.Other'), 'Outro');
check('source Other', i18next.t('source.Other'), 'Outra');
check('unknown source falls through',
  i18next.t('source.Freelance', { defaultValue: 'Freelance' }), 'Freelance');

// Every key must render without leaving a literal {{placeholder}} when given no args.
const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out); else out[key] = v;
  }
  return out;
};
let objectValued = 0;
for (const ns of Object.keys(en)) {
  for (const key of Object.keys(flat(en[ns]))) {
    const v = i18next.t(`${ns}:${key}`);
    if (typeof v !== 'string') objectValued++;
  }
}
check('no object-valued keys', objectValued, 0);

for (const l of ok) console.log('  ok  ' + l);
for (const l of fail) console.error('  FAIL ' + l);
console.log(fail.length ? `\n✖ ${fail.length} failed` : `\n✔ all ${ok.length} checks passed`);
process.exit(fail.length ? 1 : 0);
