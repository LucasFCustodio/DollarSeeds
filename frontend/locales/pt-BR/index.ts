/**
 * Brazilian Portuguese resource bundle. Mirrors `locales/en/index.ts` namespace for
 * namespace and key for key; any key missing here falls back to English.
 */
import common from './common.json';
import settings from './settings.json';
import onboarding from './onboarding.json';
import premium from './premium.json';
import notifications from './notifications.json';
import transactions from './transactions.json';
import goals from './goals.json';
import dashboard from './dashboard.json';

export default { common, settings, onboarding, premium, notifications, transactions, goals, dashboard } as const;
