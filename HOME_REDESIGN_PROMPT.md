# Home Redesign v1: a home page built around the Core Journey

The current home (`frontend/app/(tabs)/index.tsx`) was designed around the 50/30/20 split. This prompt rebuilds it around one user and one journey. Everything on the screen answers one of the four questions the user brings to the app:

| Core Journey step | The user is asking |
|---|---|
| **Analyze** | "Am I okay?" |
| **Plan** | "What's next?" |
| **Envision** | "Where is this going?" |
| **Faith Validation** | "Why does it matter?" (defined later, not part of this prompt) |

Aim for returns, not time spent in the app. A good visit can take 20 seconds, as long as the user leaves encouraged and with a reason to come back.

Read `CLAUDE.md` and the docs it points to (especially `design_system.md`, `i18n.md`, `architectural_patterns.md` and `data_model.md`). Then read the current home, `lib/debtFreedom.ts`, `components/debts/`, `app/(tabs)/transactions.tsx`, `components/expense/ExpenseContainer.jsx`, `components/income/IncomeContainer.jsx`, `constants/onboarding.ts` and `components/ui/CustomTabBar.tsx` before changing anything.

## 0. Ground rules

- **Branch:** `plant-branch` is already merged into `main`. Run `git checkout main && git pull origin main`, then create `home-redesign-branch` from it (or check it out and pull if it already exists). Commit and push only to `home-redesign-branch`. Never commit to `main`, and don't merge anything.
- **Don't break the live build.** All the API and database rules in CLAUDE.md apply. This prompt needs **no migration**. Backend work is limited to one new read-only endpoint (section 7). Don't change the shape of any existing endpoint.
- **Debt elements stay behind `DEBT_FREEDOM_ENABLED`.** The Debts tab is off in store builds, so every debt-related element on the new home renders only when the flag is on. That covers the next-payment card, the debt items in the status rotation, the debts-paid line, the debt items in the encouragement rotation, and the plant. With the flag off, the home must still look complete. Also hide the debt elements when the user has no active debts.
- **The client computes nothing about debts.** Follow the rule in `lib/debtFreedom.ts`: the server decides overdue/due-soon, the next payment, focus extras and payoff dates. The client only renders them.
- **Strings:** every user-facing string goes in the `en` and `pt-BR` catalogues, following `i18n.md`. Run `npm run check-locales` and `npm run verify-i18n`.
- **Colors:** use `useTheme()` tokens only. Never hardcode a color. The one addition allowed is the `harvestInk` token in section 1.
- Work in small, reviewable commits. Keep `index.tsx` thin and put the new pieces in `frontend/components/home/`.

## 1. Visual system for the new home

**Background:** the whole page sits on `theme.bg` (cream). The green gradient hero (`HeroBg`) is removed from the home.

**Type scale.** "Very small / small / medium / large" below always mean these exact values. Wrap every size in `ft()` so tablets scale consistently.

| Name | Size | Family / weight | Used for |
|---|---|---|---|
| Very small | 11 | Geist Regular (`Fonts.sans`), Medium for emphasis | Category examples, connect-bank prompt, bubble amounts |
| Small | 13 | Geist Medium (`Fonts.sansMedium`) | Date in top bar, debt name, status and encouragement text, tracking nudge, bubble names |
| Medium | 18 | Geist SemiBold (`Fonts.sansSemiBold`) | Split "left" amounts, payment amount, debts-paid line |
| Large | 44 | Geist Bold (`Fonts.sansBold`, weight 700), letter-spacing −1 | Income-left hero only |

The hero needs weight 700, and Instrument Serif only ships a regular weight. So the home's numbers use Geist throughout for consistency. Keep Instrument Serif for any headings that remain elsewhere.

**Spacing:** 20 px horizontal page padding (same as today). 12 px between cards in a group, 28 px between journey sections. Use `<Card>` (radius 18) for containers. The default shadow depth is 6.

**New token `harvestInk`:** add it to `ThemeContext` for yellow text on cream. Solid `harvest` (`#F4D35E`) on `#F5F1E6` is unreadable (about 1.5:1 contrast). Use light `#8A6A00` and dark `#F4D35E`. Document it in `design_system.md` next to `harvest`. It's used by the tracking nudge and the connect-bank prompt.

**Rotation component:** build one reusable `RotatingCard` for the status block and the encouragement container.

- It takes a list of items. Items with no data are left out before rendering, and the rest fill the rotation.
- It advances every **4 seconds**, sliding the new item in from right to left (Reanimated is installed).
- With one item it's static, with no auto-advance.
- It pauses when the screen loses focus or the app is in the background.
- When the OS "Reduce Motion" setting is on (`AccessibilityInfo.isReduceMotionEnabled`), it crossfades instead of sliding.
- Show small page dots only when there are 2 or more items.

## 2. Top bar

It sits on the cream background, with no container.

- **Left, profile icon:** a 36 px circle (the size of today's logo tile) with a default person glyph on `brandSoft`, in `brand` color. No name. It has no action for now; it's the future entry point for profile customization.
- **Center, date:** `"{month} {year}"`, e.g. "September 2026". Small font, `ink`. No "Budget Month" eyebrow. Use the current year; month names go through `monthLabel()`.
  - **Tapping the date opens a month picker**, replacing the old arrows. It's a bottom sheet listing the months, with the selected one highlighted. Picking one updates the month exactly as the arrows did (same fetch, same accordion/cache reset). Add a small chevron-down glyph after the date so it's discoverable.
- **Right, News and Settings:** the same icons and behavior as today (unread dot on News included), restyled for cream. They're 38 px circles on `surface` with a `border` outline and `ink` icons.

## 3. Analyze: "Am I okay?"

### 3.1 Income left (hero)

- Left-aligned, large font, `ink`. It shows the amount left this month, which is the same number as today's "left this month", including tithe handling.
- There's no total-income number. Under the hero, a full-width `AnimatedProgressBar` (height 8, `brand` fill on `borderSoft`) shows how much of this month's income has been spent. When spending goes over income, the bar is full and uses `danger`.
- **A green + button** (32 px circle, `brand` background, `onBrand` plus) sits to the right of the hero number. It opens the income logging page from section 5.1.
- Tapping the hero number itself opens the existing income list ("View all Income").

### 3.2 Status block + Tithe Envelope (same row)

**Layout decision:** while this month's tithe is not given, the status block and the tithe envelope share one row. Status takes `flex: 3` and tithe takes `flex: 2`, with a 12 px gap and equal heights. Once the tithe is given, the envelope collapses to a single line under the row, and the status block takes the full width. If the user has tithing turned off, there's no envelope and no line.

**Status block** (`RotatingCard`, solid `brand` background, `onBrand` text in small font, a 16 px leading icon per item):

- Rotation items, in this order, each shown only when it applies:
  1. "{n} debts overdue" (flag-gated). Its icon uses `harvest`.
  2. "{n} due dates coming up" (flag-gated), meaning within the next 7 days.
  3. "{Split} is {amount} over" for each split over budget. Its icon uses `harvest`.
- When none apply, a single static item reads **"All up to date"**, with a check icon.
- Tapping a debt item opens the Debts tab. Tapping an over-budget item opens that split's details.
- This is likely the most important information on the screen, so it must read as a confident, solid block rather than a line of text. Use depth 7.

**Tithe Envelope** (card on `surface`, `harvest` accent):

- Title "Tithe" and the tithe amount in medium font. Don't mention 10%.
- A **Give** toggle, reusing today's tithe-given logic and `POST /tithe/given/` unchanged, including the in-flight guard. Turning it on subtracts the tithe from the hero amount, exactly as it does today.
- **Given state:** a single line under the row: a check in `success`, "Tithe given · {amount}" in small font, and the toggle still reachable (tap the line to undo).

## 4. Plan: "What's next?"

### 4.1 Close-out card (conditional)

Keep today's close-out behavior and copy. Only the presentation changes:

- When a month is ready to close, show the close-out prompt as a card at the top of Plan.
- The "month is closed" banner becomes a single small line with the rolled-over amount and the subtle "Reopen" action (same confirmation alert as today).

### 4.2 Next upcoming debt payment (flag-gated)

- It's its own card. It shows the active debt with the nearest `next_due_date`. When several share a date, the focus debt comes first.
- **Left column:**
  - Debt name in small font, `ink2`, followed by " · due {date}" in `ink3`.
  - Below it, the payment in medium font. Non-focus debts show the minimum ("$150"). The focus debt shows minimum plus extra ("$150 + $220 extra"), where the extra is the server's `focus_extra` (section 7).
- **Right: a "Prune" button** (compact pill, `brand` background, `onBrand` text). It opens the Debts tab on that debt. If `debts.tsx` can't target a specific debt yet, add an optional `debtId` route param that pages/scrolls to it.

### 4.3 Split containers

- **Needs and Wants share a row**, each 50% wide with a 12 px gap. **Savings** sits on the next row, full width.
- Each container has the same inner layout:
  - **Top row:** the category icon tile on the left (today's mascot icons and soft colors). The amount left on the right in medium font, colored with the category token, and red (`danger`) when over.
  - **Below:** the three examples in very small font, `ink3`, one line with ellipsis. Needs: "Rent, groceries, bills". Wants: "Lifestyle, treats, fun". Savings: reuse the existing `category.goalsSub` string.
  - **Bottom:** an `AnimatedProgressBar` sized to the container, in the category color.
- Tapping a container opens that split's existing details screen (`/details`). That's where "View all" lives and where transactions are deleted. There's no editing.
- **Manual logging (no bank connection):** a small green + icon (24 px circle, `brand`) sits to the right of the amount on **Needs and Wants only**. Tapping it opens the expense logging page from section 5.1, preset to that category.
  - Savings gets no + button. Money set aside is logged through the existing Goals flows.

### 4.4 Logging area (directly under Savings)

The area is not a container and has no chevron. It shows exactly one of the following:

- **Bank connected, and there are pending transactions:** up to **3 bubbles** at a time.
  - Each bubble is a 76 px circle on `surface` with depth 3. It holds the transaction name in small font (1 line, ellipsis) and the amount in very small font. Income bubbles use the `success` color for the amount.
  - With more than 3 pending, the row pages horizontally.
  - Long-press a bubble to drag it:
    - Expense bubbles can be dropped on Needs, Wants or Savings.
    - Income bubbles can be dropped on the hero.
  - Dropping classifies the transaction. The bubble disappears, the next one slides in, and the targets briefly highlight while a drag is over them.
  - When nothing is pending, the area collapses to zero height.
- **Bank not connected, and the last logged transaction is 5 or more days old:** the **tracking nudge**, e.g. "Last logged 6 days ago. Keep your numbers current." It's in small font, `harvestInk`. Tapping it opens expense logging.
- Otherwise nothing renders.

**Placeholder system (Plaid comes later):** create `frontend/lib/bankTransactions.ts` with:

- `BANK_CONNECTION_ENABLED = false`.
- `getPendingTransactions()`.
- `classifyPendingTransaction(id, target)`.
- A typed `PendingTransaction` (`id`, `name`, `amount`, `kind: 'expense' | 'income'`, `date`).

In production, `isBankConnected()` returns `false` and the list is empty. In `__DEV__`, a `DEV_MOCK_BANK` constant lets me preview the bubbles with about 5 mock transactions, and classify removes them locally. Keep all of the drag/drop UI real, so wiring Plaid later only touches this file.

### 4.5 Connect bank prompt

- It sits directly under the logging area, in very small font, `harvestInk`, e.g. "Connect your bank to skip manual logging →".
- It shows only when the user has no premium, or has premium but no connected bank. It never shows once connected.
- On tap: free users open the existing paywall (`PaywallSheet`). Premium users see a "coming soon" note for now, since there's no Plaid yet.

## 5. Logging pages and removing the Transactions tab

### 5.1 New logging routes

- **`app/logExpense.tsx`:** renders `ExpenseContainer` with a new optional `initialCategory` prop ('needs' | 'wants'), preselected from a `category` route param. It has a back header, and returns to the home after a successful save.
- **`app/logIncome.tsx`:** renders `IncomeContainer` the same way.
- Keep both containers backward compatible. The new props are optional, and existing behavior is unchanged when they're omitted.

### 5.2 Remove the Transactions tab

- Remove the `transactions` screen from `(tabs)/_layout.tsx`, `CustomTabBar` and its icon map, and delete `app/(tabs)/transactions.tsx`.
- Remove the Log Expense / Log Income quick-action buttons from the home. Find any other navigation to `/(tabs)/transactions` (e.g. `router.push` calls, the `type` param) and point it at the new routes.
- **Onboarding:** `constants/onboarding.ts` has a `transactions` step on that route. Change that step to run on the home and describe the new + buttons, updating its copy in both locales. Keep the step count sensible.
- Leave the `transactions` locale namespace in place if the containers still use it. Remove only the keys that nothing reads (`check-locales` will tell you).

## 6. Envision: "Where is this going?" (flag-gated except goals)

### 6.1 Debts paid

- "{paid} / {total} debts paid" in medium font, left-aligned, `ink`, not in a container.
- Hidden when there are no debts.

### 6.2 Encouragement container

- A `RotatingCard` on `surface`, depth 6, with a `harvest` leading icon per item and small-font text in `ink`.
- Items, each rendering only when its data exists:
  1. **Debt-free date:** "Debt-free by {Month Year}" (from `plan_est_payoff_month`).
  2. **Almost free:** "1 month to be free from {debt}", for an active debt whose `est_payoff_month` is next month.
  3. **Focus extra:** "{amount} extra for {focus debt} this month. Keep going!", when `focus_extra > 0`.
  4. **Goals near completion:** "{goal} is {pct}% there", for savings goals at 80% or more that aren't complete. One item per goal, max 2.
- Items 1–3 are flag-gated. Item 4 works for everyone.
- If no items exist, hide the container.
- The tone should leave the user encouraged and excited about their progress.

### 6.3 Focus debt plant

- Render the focus debt's plant with `PlantView`, using the same species, growth step and pot/label treatment as on the Debts page. It must look identical, just smaller: about 55% of screen width, centered horizontally.
- Tapping it opens the Debts tab on that debt.
- Build it as its own component, `FocusPlant`, rendered from one line in `index.tsx`. **I may remove it if the page feels too crowded**, so removing that one line must leave nothing broken or orphaned.

## 7. Backend: `GET /home/summary/`

This is a new, read-only, additive endpoint. It follows the API rules, and no existing endpoint changes. It takes `month` (canonical English name) and an optional `today` (YYYY-MM-DD, the user's local date, falling back to the server date, like the `/debt-freedom/` routes). It returns everything the home needs beyond `/dashboard/{month}`:

```jsonc
{
  "last_logged_at": "2026-09-24T15:02:11Z",   // max created_at across expenses + income; null if none
  "days_since_last_log": 6,                    // null if never logged
  "over_budget": [{ "split": "wants", "amount_over": 40.0 }],
  "debts": {                                   // null when the user has no debts
    "paid_count": 3, "total_count": 8,
    "overdue_count": 1, "due_soon_count": 2,
    "next_payment": { "id": 12, "name": "Chase Visa", "due_date": "2026-10-14",
                      "min_payment": 150.0, "focus_extra": 220.0, "is_focus": true },
    "focus": { "id": 12, "name": "Chase Visa", "species": 2, "growth_step": 4, "pct_paid": 0.5 },
    "plan_est_payoff_month": "2031-06",
    "almost_free": { "id": 9, "name": "Car Loan", "est_payoff_month": "2026-10" }
  },
  "goals_near_completion": [{ "id": 4, "title": "Emergency fund", "pct": 0.85 }]
}
```

Rules, each implemented as a pure function in `backend/debt_freedom.py` (debts) or next to the existing budget helpers (the rest), with unit tests:

- **Overdue:** an active debt whose most recently passed due date closed with a net minimum below `min_payment` (the same test `process_due_dates` uses for late fees). It stays overdue until a minimum is logged in the current cycle.
- **Due soon:** an active, non-overdue debt whose `next_due_date` is within 7 days of `today` (inclusive), with `min_logged_this_cycle` false.
- **`focus_extra`:** `(suggested_payment − min_payment) + (monthly_extra or 0)` for the focus debt. It's 0 for every other debt.
- **Over budget:** reuse the exact budget and spent numbers `/dashboard/{month}` returns, so the home never disagrees with itself.
- **Goals near completion:** non-general, not completed, `target_amount > 0`, funded ÷ target ≥ 0.80. Reuse `_with_allocated`. Sort by pct descending, max 2.
- Build the debt section from the same `_df_garden` call the Debts tab uses. Don't duplicate its logic.

Add the client call and types in a new `frontend/lib/homeSummary.ts`. Fetch it in the home's `useFocusEffect` alongside the dashboard. If it fails, render the home without it and don't block the screen.

## 8. What stays the same

- `/dashboard/{month}` data, the tithe-given flow, the close-out/reopen logic and the per-month scripture modal (the "all green" celebration).
- Budget math, the Goals tab (including its legacy debt goals), Settings, News, the paywall and the onboarding gates, except for the one onboarding step changed in section 5.2.
- **Out of scope for this prompt:** logging Debt Freedom payments as savings transactions. That's a separate change to the budget data model.

## 9. Verify before you finish

- Backend: `pytest` passes, with new tests for overdue, due soon, `focus_extra`, goals near completion and the endpoint's response shape (with and without debts).
- Frontend: `npm run lint`, `npm run check-locales`, `npm run verify-i18n`.
- Check the home in these states and describe each in your summary, with a screenshot of each if you can run the app:
  1. Flag off (production look): no debt elements anywhere.
  2. Flag on, no debts.
  3. Flag on, with overdue and due-soon debts plus an over-budget split (status rotates).
  4. Everything fine ("All up to date", static).
  5. Tithe given vs. not given vs. tithing off.
  6. Manual user with stale data (nudge) vs. dev-mock bank bubbles (drag to a split, and income to the hero).
  7. Free user vs. premium (connect prompt).
  8. A month ready to close, and a closed month.
- Confirm on a small phone width (375 pt) that the status + tithe row and the Needs/Wants row fit without truncating the amounts.
- In your summary, list anything you had to decide that this prompt didn't specify.
