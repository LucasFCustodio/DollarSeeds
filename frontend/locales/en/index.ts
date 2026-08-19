/**
 * English resource bundle.
 *
 * English is the canonical locale: `fallbackLng` resolves here, and every key must
 * exist here first. `locales/pt-BR/index.ts` mirrors this file exactly — same
 * namespaces, same keys — so adding a language is copying this folder and translating
 * the values.
 */
import common from './common.json';
import settings from './settings.json';
import onboarding from './onboarding.json';
import premium from './premium.json';
import notifications from './notifications.json';
import transactions from './transactions.json';
import goals from './goals.json';

export default { common, settings, onboarding, premium, notifications, transactions, goals } as const;
