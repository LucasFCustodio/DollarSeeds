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
| [frontend/components/ui/](frontend/components/ui/) | Primitives: `Button.jsx`, `InputField.jsx`, `Dropdown.jsx` |
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
```

### Backend
```bash
cd backend
# Activate venv first (Windows: venv\Scripts\activate)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> **API URL**: Frontend hardcodes `http://10.0.0.13:8000`. Update when on a different network. See [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md#backend-api-calls).

## Design System

All colors and theme tokens come from `useTheme()` — **never hardcode colors**.

- Theme context: [frontend/context/ThemeContext.tsx](frontend/context/ThemeContext.tsx)
- Category colors: Needs = amber `#F59E0B`, Wants = violet `#8B5CF6`, Goals = emerald `#10B981`
- Action = blue `#2563EB`, Danger = red `#DC2626`
- Dark mode: system-aware by default; user toggles via 🌙/☀️ button on dashboard

→ Full token reference and Button API: [.claude/docs/design_system.md](.claude/docs/design_system.md)

## Additional Documentation

| File | When to read |
|------|-------------|
| [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md) | Before adding features — auth flow, API conventions, navigation, form patterns |
| [.claude/docs/data_model.md](.claude/docs/data_model.md) | When touching DB queries, Supabase tables, or budget calculation logic |
| [.claude/docs/design_system.md](.claude/docs/design_system.md) | When building UI — color tokens, Button variants, dark mode, SVG setup |
