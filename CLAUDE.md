# DollarSeeds

Personal finance tracker built on the **50/30/20 rule** (Needs / Wants / Goals) integrated with the Christian Faith. Users log monthly income and expenses; the app tracks spending against budget targets.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile app | Expo SDK 54 (React Native), TypeScript/JSX, Expo Router |
| Backend API | FastAPI (Python), Pydantic |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| HTTP client | Axios |
| Auth storage | AsyncStorage (session persistence) |
| SVG rendering | react-native-svg + react-native-svg-transformer |

## Key Directories

| Path | Purpose |
|------|---------|
| [frontend/app/](frontend/app/) | Expo Router screens (file = route) |
| [frontend/app/(tabs)/](frontend/app/(tabs)/) | Tab screens: Dashboard, Expense, Income, Savings |
| [frontend/components/ui/](frontend/components/ui/) | Primitives: `Button.jsx`, `InputField.jsx`, `Dropdown.jsx`, `Card.tsx`, `AnimatedAmount.tsx`, `AnimatedProgressBar.tsx`, `HeroBg.tsx`, `CustomTabBar.tsx` |
| [frontend/components/](frontend/components/) | Feature containers: `expense/`, `income/`, `savings/` |
| [frontend/context/](frontend/context/) | `AuthContext.tsx` (auth state), `ThemeContext.tsx` (design tokens + dark mode) |
| [frontend/constants/theme.ts](frontend/constants/theme.ts) | `Colors` (nav compat) + `CategoryColors` (needs/wants/goals) |
| [frontend/assets/images/](frontend/assets/images/) | `DollarSeeds-logo.svg` (dashboard logo), `icon.png` (app icon) |
| [frontend/metro.config.js](frontend/metro.config.js) | Metro bundler — SVG transformer config |
| [backend/main.py](backend/main.py) | All FastAPI routes and Supabase query logic |

## Commands

### Frontend
```bash
cd frontend
npm start -- --clear   # clear cache when metro.config.js changes
npm run android
npm run ios
npm run lint
npm run check-locales  # locale parity + any catalogue string still hardcoded
npm run verify-i18n    # boots i18next on the real catalogues (plurals, pt-BR resolution)
```

#### Dev build on a physical iPhone

**Expo Go cannot run this app.** `react-native-purchases` and `@sentry/react-native` are
third-party native modules Expo Go does not bundle, so IAP and crash reporting are absent
and the app fails at startup. A development build is required on device.

```bash
cd frontend
eas build --profile development --platform ios   # build the dev client, then install via the QR/link
eas build:list --platform ios --limit 5          # recent builds + their status
```

The `development` profile in [frontend/eas.json](frontend/eas.json) sets
`developmentClient: true` and `distribution: internal` — an ad-hoc build for registered
devices, not a store build.

Install it **once**, then `npm start` and open the dev client: JS and asset changes reload
over the network with no rebuild. Rebuild only when native config changes — a new native
dependency, or an `app.json` plugin / bundle-id / entitlement edit.

### Backend
```bash
cd backend
# Activate venv first (Windows: venv\Scripts\activate)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> **API URL**: Frontend hardcodes `http://10.0.0.13:8000`. Update when on a different network. See [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md#backend-api-calls).

## Design System — "Seed & Soil"

All colors and theme tokens come from `useTheme()` — **never hardcode colors**.

- Theme context: [frontend/context/ThemeContext.tsx](frontend/context/ThemeContext.tsx)
- Background: warm cream `#F5F1E6` (dark: `#0A1612`) — token `theme.bg`
- Brand: forest `#0F3D2E` + emerald `#10B981` — tokens `theme.brand` / `theme.brand2`
- Category colors: Needs = warm-amber `#C2701C`, Wants = violet `#7C3AED`, Goals = emerald `#10B981`
- Danger = red `#B91C1C`, Harvest yellow = `#F4D35E`
- Typography: Instrument Serif (display/amounts) · Geist (UI) · JetBrains Mono (eyebrows/dates) — use the `Fonts` export from ThemeContext
- Shadows: `shadow(depth)` helper exported from ThemeContext — depth 0–10
- Dark mode: system-aware by default; user toggles via 🌙/☀️ button in dashboard hero

→ Full token reference, type scale, shadow scale, and component API: [.claude/docs/design_system.md](.claude/docs/design_system.md)

## Additional Documentation

| File | When to read |
|------|-------------|
| [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md) | Before adding features — auth flow, API conventions, navigation, form patterns |
| [.claude/docs/data_model.md](.claude/docs/data_model.md) | When touching DB queries, Supabase tables, or budget calculation logic |
| [.claude/docs/design_system.md](.claude/docs/design_system.md) | When building UI — color tokens, Button variants, dark mode, SVG setup |
| [.claude/docs/lessons_page.md](.claude/docs/lessons_page.md) | When touching the Lessons tab — written vs video content, series/lessons schema, storage buckets, backend routes |

## Important - DB Changes

The app is live with active users, and the frontend ships as **app-store builds** — old binaries stay installed on people's phones indefinitely and cannot be force-updated. "Don't break the current build" is therefore not enough: every DB and API change must also keep working for the app versions already in the wild.

### Expand → contract (never skip to contract)

Any change that adds, removes, renames, or reshapes a field is split across **two releases**:

1. **Expand — this release.** Add the new form *alongside* the old. Both are written and both are served. Old apps keep reading the old field; new apps read the new one.
2. **Contract — a later release.** Once the new version is out, adopted, and confirmed working, remove the old field.

Never do both in one release, even when every frontend call site has been updated — those updated call sites only exist on phones that took the update.

### Database rules

- **Additive only.** No `DROP TABLE` / `DROP COLUMN`, no renames, no type narrowing, no tightening a `CHECK` against existing rows, no `NOT NULL` without a default on a populated table.
- New columns are **nullable** and added with `add column if not exists`, with a documented fallback for pre-migration rows.
- Widening a `CHECK` (allowing a new value) is safe; narrowing one is a contract step.
- To rename or reshape: add the new column, dual-write both, backfill, and only drop the old one at the contract step.
- Every change is a numbered file in [backend/migrations/](backend/migrations/), following the format of [0004_goal_completion_snapshot.sql](backend/migrations/0004_goal_completion_snapshot.sql) — a header comment stating why, what old rows fall back to, and an `Applied to project … on <date>` line.
- **Claude may apply migrations** to production via the authed Supabase MCP (`apply_migration`), but only after passing the gate below. Otherwise Claude writes the file and the user applies it via the Supabase dashboard.

#### The gate — Claude applies a migration only if ALL of these hold

The live App Store binary keeps calling production forever and cannot be force-updated. A migration that breaks it has no rollback that reaches those users. So before applying, Claude states explicitly, in the response, that every one of these is true:

1. **Additive only** — creates tables/indexes, adds nullable columns, widens a `CHECK`, or changes a `DEFAULT`. Nothing dropped, renamed, retyped, or narrowed.
2. **No existing row is rewritten or revalidated.** A new `DEFAULT` affects future inserts only; a new constraint must not be validated against existing rows.
3. **Every currently-deployed query still returns the same rows and the same columns** after it runs — including queries in the binary already on people's phones, not just the ones on this branch.
4. **Nothing the live app reads becomes unavailable**, even briefly. No locking rewrite of a populated table, no dropping or recreating anything the app touches.
5. **Reversible without an app update.** If it turns out wrong, the fix is a config flag or a follow-up additive migration — never "ship a new binary."

If any of the five is uncertain, that uncertainty resolves to **no**: write the file, explain what's ambiguous, and let the user apply it by hand.

#### Always, when applying

- Apply exactly what is committed in [backend/migrations/](backend/migrations/) — never an ad-hoc variant typed into the tool call.
- Run the migration's own `Verify after applying` queries afterwards and report the results, including confirmation that pre-existing rows are unchanged.
- Fill in the `Applied to project … on <date>` line with the real date and commit it.
- **Never** `DROP`, `TRUNCATE`, `ALTER … TYPE`, or `UPDATE`/`DELETE` production data as part of a migration. Contract steps are always the user's to run by hand, after confirming adoption of the release that made them safe.

### API rules

- Never remove, rename, or retype a response field in the same release that adds its replacement — serve **both** keys until the contract step.
- New request fields must be **optional with a server-side default**, so old clients that omit them still succeed.
- Never make an existing endpoint stricter (new required param, tighter validation) — old clients will start failing.
- Behaviour old clients can't opt into belongs on a **new endpoint or a new optional field**, never in a repurposed existing one.

### Branching

Never commit to `main`. If the prompt specifies no branch, create a new `change-X-branch`, where X is the next unused number.