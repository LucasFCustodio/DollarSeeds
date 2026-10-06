/**
 * verify-plan-pricing — unit tests for the paywall's derived figures (lib/planPricing.ts).
 *
 * House pattern (see verify-goal-rate.mjs): a plain node script against the REAL module,
 * asserting and exiting non-zero. The cases are the ones that would put a wrong claim
 * on the Annual card: a discount rounded up, a float landing a point low, a saving
 * shown across two currencies, and a "saving" that is zero or negative.
 *
 * Run: npm run verify-plan-pricing
 */
import { derivePlanPricing, formatStorePrice } from '../lib/planPricing.ts';

let failures = 0;
function check(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) console.log(`  ok  ${label}: ${JSON.stringify(actual)}`);
    else { failures++; console.log(`  FAIL  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const EN = { group: ',', decimal: '.' };
const PT = { group: '.', decimal: ',' };
const usd = price => ({ price, currencyCode: 'USD' });

console.log('current US prices');
check('9.99 / 69.99', derivePlanPricing(usd(9.99), usd(69.99), EN),
    { discountPercent: 41, twelveMonths: '$119.88', perMonth: '$5.83' });

console.log('rounding');
// 1 - 69.99/119.88 = 41.62% — must floor to 41, never round to 42.
check('floors, never rounds up', derivePlanPricing(usd(9.99), usd(69.99), EN)?.discountPercent, 41);
// Exact percentages must not floor a point low through float error — the cents maths.
check('exactly 50%', derivePlanPricing(usd(10), usd(60), EN)?.discountPercent, 50);
check('exactly 30% (float trap: 1 - 0.7)', derivePlanPricing(usd(10), usd(84), EN)?.discountPercent, 30);
check('99.5% floors to 99', derivePlanPricing(usd(100), usd(6), EN)?.discountPercent, 99);

console.log('currencies and separators');
check('BRL in pt-BR', derivePlanPricing(
    { price: 49.9, currencyCode: 'BRL' }, { price: 299.9, currencyCode: 'BRL' }, PT),
    { discountPercent: 49, twelveMonths: 'R$ 598,80', perMonth: 'R$ 24,99' });
check('CAD in en', derivePlanPricing(
    { price: 12.99, currencyCode: 'CAD' }, { price: 89.99, currencyCode: 'CAD' }, EN),
    { discountPercent: 42, twelveMonths: '$155.88', perMonth: '$7.50' });
check('thousands grouping', formatStorePrice(123456, 'BRL', PT), 'R$ 1.234,56');
check('unknown currency falls back to ISO code', formatStorePrice(583, 'EUR', PT), 'EUR 5,83');

console.log('hidden (null)');
check('monthly missing', derivePlanPricing(null, usd(69.99), EN), null);
check('yearly missing', derivePlanPricing(usd(9.99), undefined, EN), null);
check('currencies differ', derivePlanPricing(usd(9.99), { price: 69.99, currencyCode: 'CAD' }, EN), null);
check('zero saving', derivePlanPricing(usd(10), usd(120), EN), null);
check('negative saving', derivePlanPricing(usd(10), usd(130), EN), null);
check('saving under 1%', derivePlanPricing(usd(10), usd(119.5), EN), null);
check('zero price', derivePlanPricing(usd(0), usd(69.99), EN), null);
check('NaN price', derivePlanPricing(usd(NaN), usd(69.99), EN), null);

if (failures) {
    console.error(`\n✖ ${failures} failure(s)`);
    process.exit(1);
}
console.log('\n✔ plan pricing');
