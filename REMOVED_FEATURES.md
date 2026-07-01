# Removed Features (Parked for Possible Return)

Features that were removed from the **frontend UI** because they didn't earn their
place yet — but whose **backend logic is intentionally kept** so they can be brought
back quickly later without rebuilding the server side.

> **Rule for everything in this file:** remove only the frontend (screens, buttons,
> components, derived values, styles). **Do not delete the backend endpoints or
> helpers** that power them — leave them in place, untouched, so a future restore is
> a frontend-only change.

---

## 1. Budget Health score

**What it was:** A pill in the dashboard hero showing an overall "Budget Health · X/10"
score with a label ("Good discipline — keep it up") and a small progress bar.

**Why removed:** It's an abstract number that doesn't tell the user much or point to a
concrete action.

**Frontend removed** (in [frontend/app/(tabs)/index.tsx](frontend/app/(tabs)/index.tsx)):
- The `{/* Budget health pill */}` `View` in the hero.
- The `score` derived value and the `getScoreLabel()` helper.
- `compliance_score` from the `dashboardData` destructure.
- Styles: `healthPill`, `healthTitle`, `healthHint`, `healthBarTrack`, `healthBarFill`.
- `IconSparkle` import (only used by the pill).

**Backend KEPT (do not remove):**
- `calculate_category_score()` in [backend/main.py](backend/main.py).
- The `compliance_score` block (`overall`/`needs`/`wants`/`goals`) still returned by
  `GET /dashboard/{current_month}`.
- The `compliance_score` field is also still present in the frontend `DashboardData`
  type and default state — harmless, and it keeps the API shape documented for restore.

**To bring back:** re-add the hero pill that reads `dashboardData.compliance_score.overall`.
Nothing on the server needs to change.

---

## 2. Spending Trends

**What it was:** A "Trends" button on the dashboard section header that opened a
`/trends` screen showing a "Wants Spending Rhythm" (quartile bands) and per-category
month-over-month history.

**Why removed:** Users can already eyeball month-over-month spending by paging through
months on the dashboard. The "spending rhythm" view needs more substance to justify
itself; parked until it does.

**Frontend removed:**
- The Trends `Pressable` button + `trendsBtn` / `trendsBtnText` styles and the
  `IconTrend` import in [frontend/app/(tabs)/index.tsx](frontend/app/(tabs)/index.tsx).
- The screen file `frontend/app/trends.tsx` (deleted — recoverable from git history).

**Backend KEPT (do not remove):**
- `GET /dashboard/trends/` in [backend/main.py](backend/main.py) and its helpers
  (`group_by_month`, `spending_quartiles`).
- Note this endpoint is **still actively used** elsewhere: Settings calls it to compute
  the Firm Foundation emergency-fund suggestion ([frontend/app/settings.tsx](frontend/app/settings.tsx)).
  So it must stay regardless.

**To bring back:** restore a `trends.tsx` screen (git history has the old one) and a
navigation entry point that fetches `GET /dashboard/trends/`.
