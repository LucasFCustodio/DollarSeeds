# DollarSeeds

Personal finance tracker based on the **50/30/20 budgeting rule** (50% Needs, 30% Wants, 20% Goals) that is integrated with the Christian Faith. Users log monthly income and expenses; the app tracks spending against budget targets.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile app | Expo (React Native), TypeScript/JSX, Expo Router |
| Backend API | FastAPI (Python), Pydantic |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| HTTP client | Axios |
| Auth storage | AsyncStorage (session persistence) |

## Key Directories

| Path | Purpose |
|------|---------|
| [frontend/app/](frontend/app/) | Expo Router screens (file = route) |
| [frontend/app/(tabs)/](frontend/app/(tabs)/) | Bottom-tab screens: Dashboard, Add Expense, Add Income |
| [frontend/components/](frontend/components/) | Reusable UI; `ui/` for primitives, `expense/` and `income/` for feature forms |
| [frontend/context/](frontend/context/) | React Context providers (`AuthContext.tsx`) |
| [frontend/lib/](frontend/lib/) | Supabase client init (`supabase.ts`) |
| [frontend/constants/](frontend/constants/) | App-wide constants (`theme.ts` for colors/fonts) |
| [frontend/app/(tabs)/piggyBank.tsx](frontend/app/(tabs)/piggyBank.tsx) | Piggy bank screen — savings deposit/withdrawal UI and transaction history |
| [frontend/components/savings/](frontend/components/savings/) | `SavingsContainer.jsx` — form component for savings deposits and withdrawals |
| [backend/main.py](backend/main.py) | All FastAPI routes and Supabase query logic |

## Commands

### Frontend
```bash
cd frontend
npm start          # Expo dev server (scan QR for device)
npm run android    # Android emulator
npm run ios        # iOS simulator
npm run lint       # ESLint via expo lint
```

### Backend
```bash
cd backend
# Activate venv first (Windows: venv\Scripts\activate)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> **API URL note**: Frontend components hardcode `http://10.0.0.13:8000` (phone on local network) or `http://127.0.0.1:8000`. Update these when testing on different networks. See [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md#backend-api-calls).

## Additional Documentation

Check these files when working on the relevant area:

| File | When to read |
|------|-------------|
| [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md) | Before adding features — covers auth flow, API call conventions, DB query structure, navigation, and form patterns |
| [.claude/docs/data_model.md](.claude/docs/data_model.md) | When touching DB queries, Supabase tables, or the budget calculation logic |
