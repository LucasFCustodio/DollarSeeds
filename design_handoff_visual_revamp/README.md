# Handoff: DollarSeeds Visual Identity Revamp

## Overview

This package documents a complete visual identity revamp for **DollarSeeds**, the React Native (Expo) 50/30/20 budgeting + Christian-stewardship app. The goal of the revamp is to replace the existing flat, default-looking UI with a polished, modern fintech aesthetic that leans into the brand name — "**Seed & Soil**". All existing functionality is preserved; only the visual language changes.

## About the Design Files

The files in `prototype/` (and the entry HTML `DollarSeeds Revamp.html`) are **design references created in HTML/React + Babel**. They are not production code to copy directly into the app.

The task is to **recreate these designs inside the existing DollarSeeds React Native / Expo codebase**, using:
- The existing `useTheme()` hook in `frontend/context/ThemeContext.tsx` (extended with new tokens — see "Design Tokens" below)
- The existing primitives at `frontend/components/ui/` (Button, InputField, Dropdown)
- React Native primitives (`View`, `Text`, `ScrollView`, `Pressable`, `react-native-svg`)
- `react-native-reanimated` (or `Animated` from RN) for the animations

The web prototype uses Instrument Serif via Google Fonts; in React Native this means installing `expo-font` and bundling the matching `.ttf` files.

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, shadow recipes, animation timings, and copy are all final. The developer should match the prototype pixel-for-pixel where the platform allows. Where React Native diverges from web (e.g. no `backdrop-filter`, no `box-shadow` on Android), follow the platform-equivalents called out in "Platform notes" below.

## The system — what changed

| Aspect | Before | After |
|---|---|---|
| **Surface** | Flat `#F8FAFC` slate background, flat white cards | Warm cream `#F5F1E6` background, soft layered cards with depth |
| **Brand color** | Action blue `#2563EB` | Forest `#0F3D2E` + Emerald `#10B981` gradient |
| **Category colors** | Amber / Violet / Emerald, raw saturation | Warm-amber / Soft-violet / Emerald, harmonized to forest backdrop |
| **Display typography** | Default system sans | **Instrument Serif** for amounts & headings (gives currency figures personality) |
| **UI typography** | Default system | **Geist** (sans) for UI, **JetBrains Mono** for metadata/dates |
| **Iconography** | Default SF Symbols / emoji (🐷 🙏) | Custom inline SVG botanical glyphs (sprout, leaf, jar, bread loaf, flame, seed) |
| **Hero areas** | Flat colored band | Curved-bottom gradient hero with subtle leaf flourish SVG |
| **Cards** | Hard 1px borders | Soft multi-layer shadows, no borders (depth tied to a `depth` token, 0–10) |
| **Progress bars** | Solid fill, instant | Animated fill on mount, color-tinted glow, cubic ease |
| **Amounts** | Static text | Number tickers — animate from 0 to value over 900ms |
| **Tab bar** | Standard bottom tabs with system icons | Floating pill tab bar, active tab grows into a colored pill, spring transition |
| **Faith layer** | Emoji-heavy (🙏 modal, 🐷 piggy) | Subtle — italic Instrument Serif verses in cards, monospace references, no emoji |

---

## Screens / Views

All screens are 390pt wide (iPhone), inside the existing tab bar. Below are the five primary screens that map 1-to-1 to the existing app's tabs.

### 1. Dashboard (`frontend/app/(tabs)/index.tsx`)

**Purpose:** Show the user's income, spending vs. budget across Needs/Wants/Goals, and budget health.

**Layout (top to bottom):**
1. **Hero** — gradient header with curved bottom corners (`borderBottomLeftRadius: 32, borderBottomRightRadius: 32`).
   - Top row: leaf logo glyph (36×36 rounded-12 tinted-white square containing the `IconLeaf` SVG) + "DollarSeeds" wordmark + user subline "Sarah · steward" in 11px JetBrains Mono · right side has two 38×38 circular glass-pill buttons (dark/light toggle, bell with yellow dot).
   - Month nav row: 38×38 chevron-left pill / centered "BUDGET MONTH" eyebrow above "April 2026" in Instrument Serif 18px / chevron-right pill.
   - Big amount: eyebrow `"$5,200 INCOME · LEFT TO LIVE"` in 12px white/70%, then `$2,450` in Instrument Serif **64px** white, with a `left this month` pill chip below on its own line (8px gap).
   - Budget health pill (glass, blurred, white-12% bg, 18px top margin): sparkle icon, "Budget Health · 8.4/10" + italic hint, mini progress bar in harvest yellow `#F4D35E`.
2. **Scripture banner** (overlap −16px into hero — `marginTop: -16` on the content container) — soft surface card with brand-soft icon tile, Instrument Serif italic verse, JetBrains Mono reference. **Tied to `scriptureBanner` tweak — can be toggled off.**
3. **Section title** "How your seeds are growing" (15px semibold) + right-aligned "Trends" link with chart icon.
4. **3 category cards** (`Needs / Wants / Goals`):
   - 18px radius, soft shadow (`depth: 7`)
   - Icon tile (48×48, radius 14, soft category color bg) containing custom `IconNeeds` (bread loaf), `IconWants` (flame), or `IconGoals` (sprout in soil)
   - Title (16px semibold) + "50%" / "30%" / "20%" in 11px JetBrains Mono
   - Right side: amount left in Instrument Serif 22px + tiny `LEFT` / `OVER` eyebrow
   - Progress bar (height 8, glow shadow in category color)
   - Spent / budget row in 11px JetBrains Mono
   - **Tap to expand** — soft surface accordion reveals individual transactions with their custom glyph icons; 320ms ease-out max-height transition
   - Goals card additionally shows piggy-bank balance row at the bottom of the expanded state, in brand-soft tile
5. **Quick actions** — two buttons in a `1fr 1fr` grid: brand-filled "Log Expense", outlined "Log Income"

**State:**
- `monthIdx` (0–11), `currentMonth` derived
- `expandedCat` (`'needs' | 'wants' | 'goals' | null`)
- All financial data still comes from the existing `/dashboard/{month}` and `/savings/balance/` endpoints

### 2. Add Expense (`frontend/app/(tabs)/add.tsx`)

**Purpose:** Log a single expense with category + sub-category.

**Layout:**
1. Back chevron in 38×38 rounded-12 surface tile + "New Expense" Instrument Serif 26px + italic subtitle "Plant where it counts" (12px).
2. **Amount display card** — full forest→emerald gradient like the income card, white text, subtle leaf SVG flourish. `AMOUNT` eyebrow → big `$48.50` in Instrument Serif **64px** centered → Apr 15, 2026 date in 11px JetBrains Mono.
3. **Category** section (11px monospace label) — 3-column grid of category cards. Each card: 16px radius, 1.5px border that turns category-colored when active, custom icon, label. Active card lifts (`translateY(-2px)`) and gets a depth shadow.
4. **Sub-category** chips — pill chips (999 radius, 8px×14px padding, 12px semibold). Inactive: surface bg with border. Active: category-colored bg, white text. **All three categories include an "Other" option.**
   - Needs: `Rent, Groceries, Utilities, Transit, Insurance, Healthcare, Other`
   - Wants: `Dining, Coffee, Streaming, Shopping, Travel, Gifts, Other`
   - Goals: `Emergency, Retirement, Loan, Investing, Tithe, Other`
5. **Note** text input (12px radius, 14px×16px padding).
6. Full-width category-colored submit button "Plant Expense" + check icon.

**State:** `amount`, `category` (`needs|wants|goals`), `subcat`, `title`, `day`.

### 3. Add Income (`frontend/app/(tabs)/addIncome.tsx`)

**Purpose:** Log income and preview the 50/30/20 split.

**Layout:**
1. Same back chevron + "Log Income" header + italic subtitle "Every harvest counts".
2. **Amount card** — full forest→emerald gradient, leaf SVG flourish. White `AMOUNT RECEIVED` eyebrow → `$5,200` in Instrument Serif **72px** → italic verse `"Every good and perfect gift is from above" — James 1:17`.
3. **Split preview card** — surface card with eyebrow "How it splits", then a 12px tall stacked horizontal bar (50% needs / 30% wants / 20% goals), then 3-column legend with colored dots + label + computed amount in Instrument Serif 20px.
4. **Source** chips — `Paycheck, Side gig, Gift, Refund, Bonus, Other`. Active uses brand-filled pill.
5. Brand-filled submit button "Add to Harvest" + check icon.

### 4. Piggy Bank / Savings (`frontend/app/(tabs)/piggyBank.tsx`)

**Purpose:** Track savings balance + multiple goals + deposit/withdraw history.

**Layout:**
1. **Hero** — gradient header with curved bottom, taller than dashboard. Back chevron + centered eyebrow "SAVINGS" + plus icon on right.
2. **Animated SVG savings jar** (90×100, custom `SavingsJar` component) — coin-yellow fill rises to match `balance / 3000` ratio, lid + shine + leaf sprout poking out of the top. Paired with "YOUR PIGGY BANK" eyebrow, animated `$1,284.50` in Instrument Serif 48px, italic subtitle "Little by little, it grows".
3. Two glass action buttons: "Set aside" / "I bought it".
4. **Active / Completed** segmented tabs (soft surface track, white active pill with shadow).
5. **"Growing now"** section — list of goal cards. Each card: target icon in brand-soft tile + title + monospace "Save $X/week · 4mo left" sub + delete chevron. Big saved amount in Instrument Serif 26px with `of $TARGET` in muted. Goal-colored progress bar.
6. **"Plant a new goal"** dashed-border ghost button with plus.
7. **"Recent activity"** — minimal cards, 34×34 colored tile with up/down arrow (deposit = brand-soft + brand color, withdrawal = danger-soft + danger), name + Apr X date, signed amount in JetBrains Mono semibold (success green for + / danger red for −).

**State:** `tab` (`active|completed`), `showForm`, `balance`, `goals[]`, `history[]`.

### 5. Lessons (`frontend/app/(tabs)/lessons.tsx`)

**Purpose:** Browse Bible-rooted financial lessons; rate them with stars.

**Layout:**
1. Header: "Lessons from the field" — Instrument Serif **36px** with a hard line break and 1.05 line-height, letter-spacing `-0.02em`. Sub: "Scripture-rooted reflections on money, generosity, and stewardship." (13px, ink-2).
2. **Progress strip** — horizontal: 6px-tall brand progress bar showing `done / total`, monospace label "2 of 5 lessons completed", and a brand-soft pill "40%" on the right.
3. **Lesson list** — each is a 18px-padding card:
   - Left: **44×44** numbered tile. Done lessons get a brand-filled tile with a white check icon. Pending lessons get a surface tile with a 1.5px brand border and the lesson number `01`, `02`, ... in Instrument Serif 22px.
   - Right column: title (15px semibold) + minute count in monospace top-right + description (13px ink-2) + footer row with a brand scripture-chip ("Luke 16:1-13") on the left and a 5-star rating on the right (12-character D4B254 gold; star ratings open the existing rating modal/alert flow).

---

## Interactions & Behavior

### Navigation
- Bottom tab bar floats above content (16px from edges, 14px from bottom). Active tab's icon container animates into a brand-filled pill (240ms cubic-bezier spring `0.34, 1.56, 0.64, 1`). Labels are 10px semibold; active label gets brand color.
- Header back chevrons return to home (in RN, use `router.back()`).
- Tapping a category card on the dashboard expands its transaction list inline (max-height transition 320ms).

### Animations (gated by the `animate` token; default `true`)
- **Number tickers** — `useTicker(target, { duration: 900 })`. Uses cubic ease-out (`1 - (1-p)^3`) on `requestAnimationFrame`. Use **`react-native-reanimated`**'s `useSharedValue` + `withTiming` (`Easing.out(Easing.cubic)`, `duration: 900`) in RN, then `useAnimatedProps` to drive a `<Text>` via `Reanimated.Text`.
- **Progress bars** — same timing, 1100ms duration; fill width animates from 0 to target. Inline glow: `boxShadow: 0 0 12px {color}55` (web) → use a faint colored View with `shadow*` props on iOS in RN.
- **Screen transitions** — `screenIn` keyframe: 360ms `cubic-bezier(0.22, 1, 0.36, 1)`, `opacity 0→1` + `translateY 8→0`. Reanimated `withTiming` with the equivalent easing.
- **Category card expand** — `max-height` transition, 320ms ease. RN: use `LayoutAnimation` or Reanimated `useAnimatedStyle` with `height: withTiming(measured)`.
- **Tab pill activate** — 240ms spring (`0.34, 1.56, 0.64, 1`). RN: Reanimated `withSpring({ damping: 12, stiffness: 200 })`.

### Hover/press states (RN: use `Pressable` with `pressed` style)
- Buttons: subtle scale-down on press (`transform: [{ scale: 0.97 }]`).
- Cards: no hover state by default; tap-able ones briefly increase shadow.

### Form behavior
- Expense + income forms preserve the existing validation rules in the codebase. Only chrome changes.
- Goal creation form, deposit/withdraw forms — same.

---

## State Management

No state-management changes. All existing screens keep their:
- `useFocusEffect` data fetches
- `useState` form state
- `useAuth` / `useTheme` context usage
- Backend axios calls to `http://10.0.0.13:8000`

The new theme tokens are simply added to `frontend/context/ThemeContext.tsx`. The `useTicker` hook can be added as `frontend/hooks/useTicker.ts`.

---

## Design Tokens

These tokens must be added to `frontend/context/ThemeContext.tsx`. Existing tokens remain (for back-compat).

### Light theme

```ts
{
  // Backgrounds
  bg: '#F5F1E6',            // warm cream, replaces #F8FAFC
  surface: '#FFFFFF',
  surfaceSoft: '#FAF6EB',   // tinted card / pressed state
  surfaceElev: '#FFFFFF',
  border: '#E5DDC9',
  borderSoft: '#EFE9D8',

  // Text
  ink: '#0F2820',           // dark forest, replaces #0F172A
  ink2: '#4A5C56',          // textSecondary
  ink3: '#8FA39C',          // textMuted

  // Brand (palette: 'forest' — default)
  brand: '#0F3D2E',         // forest
  brand2: '#10B981',        // emerald
  brandSoft: '#E8F3EE',
  onBrand: '#FFFFFF',

  // Categories
  needs: '#C2701C',  needsSoft: '#FBEDD9',  // warm amber (was #F59E0B)
  wants: '#7C3AED',  wantsSoft: '#EFE6FB',  // violet (unchanged)
  goals: '#10B981',  goalsSoft: '#E8F3EE',  // emerald (matches brand2)

  // Status
  danger:  '#B91C1C', dangerSoft:  '#FBE7E7',
  success: '#0F8C5C', successSoft: '#E5F3EC',

  // Accent
  harvest: '#F4D35E',  // used for budget-health bar, jar fill
}
```

### Dark theme

```ts
{
  bg: '#0A1612',
  surface: '#13231C',
  surfaceSoft: '#1A2D24',
  surfaceElev: '#1E332A',
  border: '#1F3A2E',
  borderSoft: '#162720',

  ink: '#F4F1E8',
  ink2: '#9BB1A5',
  ink3: '#6A8478',

  brand: '#0F3D2E',
  brand2: '#10B981',
  brandSoft: '#0F2A20',
  onBrand: '#FFFFFF',

  needs: '#F4B860', needsSoft: '#2C2010',
  wants: '#B898F7', wantsSoft: '#1F1830',
  goals: '#34D399', goalsSoft: '#0F2A20',

  danger:  '#F87171', dangerSoft:  '#2C1818',
  success: '#34D399', successSoft: '#0F2A20',

  harvest: '#F4D35E',
}
```

### Alternate palettes (optional, exposed via tweaks)

| Name | `brand` | `brand2` | `brandSoft` |
|---|---|---|---|
| **forest** (default) | `#0F3D2E` | `#10B981` | `#E8F3EE` |
| sage | `#3B6B4F` | `#7FB897` | `#EEF4EF` |
| indigo | `#1E3A8A` | `#60A5FA` | `#E8EEFB` |
| plum | `#4A1D4E` | `#C084FC` | `#F2E9F4` |

### Typography

Install via `expo-font`:

```bash
npx expo install expo-font
```

Required font families (download from Google Fonts):
- **Instrument Serif** — `InstrumentSerif-Regular.ttf`, `InstrumentSerif-Italic.ttf`
- **Geist** — `Geist-Regular.ttf`, `Geist-Medium.ttf`, `Geist-SemiBold.ttf`, `Geist-Bold.ttf`
- **JetBrains Mono** — `JetBrainsMono-Regular.ttf`, `JetBrainsMono-Medium.ttf`, `JetBrainsMono-SemiBold.ttf`

Type scale:

| Role | Family | Size | Weight | Letter-spacing | Used for |
|---|---|---|---|---|---|
| Display XL | Instrument Serif | 72 | 400 | -0.02em | Income amount card |
| Display L | Instrument Serif | 64 | 400 | -0.02em | Dashboard hero amount, Expense amount |
| Display M | Instrument Serif | 48 | 400 | -0.02em | Savings balance |
| Display S | Instrument Serif | 36 | 400 | -0.02em | "Lessons from the field" |
| Heading | Instrument Serif | 26 | 400 | -0.02em | Screen titles |
| Amount | Instrument Serif | 22 | 400 | -0.02em | Category card "left" amount |
| Amount sm | Instrument Serif | 20 | 400 | -0.02em | Income split legend |
| Body | Geist | 14 | 400 | — | UI text |
| Body strong | Geist | 14 | 500 | — | Transaction names |
| Title | Geist | 15-16 | 600 | -0.01em | Card titles, section headers |
| Subtitle | Geist | 13 | 400 | — | Card descriptions |
| Caption | Geist | 12 | 500 | — | Small labels |
| Eyebrow | JetBrains Mono | 10-11 | 600 | 0.16em | Uppercase section labels |
| Meta | JetBrains Mono | 11 | 400 | 0.04em | Dates, "Apr 15", $ amounts inline |

### Spacing scale

| Token | px | Used for |
|---|---|---|
| `xs` | 4 | Tight chip gaps |
| `s` | 8 | Card internal gap, button icon gap |
| `m` | 12 | Standard between siblings |
| `l` | 16 | Card padding default |
| `xl` | 18-20 | Section margin, screen padding |
| `2xl` | 22-28 | Hero padding |
| `3xl` | 32 | Hero bottom curve radius |

### Radii

| Token | px | Used for |
|---|---|---|
| `sm` | 10 | Sub-tiles inside cards |
| `md` | 12-14 | Buttons, input fields, icon tiles |
| `lg` | 18 | Card default |
| `xl` | 24 | Tab bar |
| `full` | 999 | Pills, chips, progress bars |
| `heroBottom` | 32 | Bottom corners of curved hero |

### Shadows (depth scale, 0–10)

```ts
function shadow(depth: number) {
  const d = Math.max(0, Math.min(10, depth));
  if (d === 0) return { shadowColor: 'transparent' };
  return {
    shadowColor: '#0F2820',
    shadowOffset: { width: 0, height: 4 + d * 0.8 },
    shadowOpacity: 0.04 + d * 0.008,
    shadowRadius: 12 + d * 2.2,
    elevation: Math.round(2 + d * 0.8),  // Android
  };
}
```

Default `depth = 7` for category/hero cards, `5` for amount/income cards, `2-3` for compact transaction rows.

---

## Iconography — replacing default icons

Every icon in `prototype/icons.jsx` is a custom inline SVG. Port these as `react-native-svg` components in `frontend/components/icons/`.

### Tab bar icons (24×24)
- `IconHome` — house outline with sprout coming out the roof
- `IconExpense` — circle with right-pointing arrow inside
- `IconIncome` — circle with left-pointing arrow inside (mirror of expense)
- `IconSavings` — clay jar shape with a sprout poking through the lid
- `IconLessons` — open book with a leaf bookmark

All accept `{ size, color, accent, filled }`. The `filled` prop adds a soft-tint backdrop and is used when the tab is active.

### Category icons (32×32, accent-colored)
- `IconNeeds` — bread loaf with hatching marks (warm amber)
- `IconWants` — flame with inner ember (violet)
- `IconGoals` — sprout-in-soil with twin leaves (emerald)

### Transaction glyphs (20×20)
Each transaction category gets its own glyph:
- `GlyphHouse` — outlined house with door
- `GlyphCart` — shopping cart with wheels
- `GlyphCar` — car silhouette with wheels
- `GlyphCoffee` — coffee cup with steam
- `GlyphFilm` — film strip / cinema
- `GlyphGift` — wrapped box with bow
- `GlyphSeed` — seed/leaf hybrid
- `GlyphBriefcase` — work/loan briefcase

### Utility icons
`IconChevronLeft/Right/Up/Down`, `IconPlus`, `IconClose`, `IconCheck`, `IconBell`, `IconUser`, `IconCalendar`, `IconStar` (filled/outline), `IconTrash`, `IconEdit`, `IconLeaf`, `IconSparkle`, `IconTrend`, `IconScripture`, `IconMoon`, `IconSun`, `IconTarget`, `IconArrow` (with `dir: 'up'|'right'|'down'|'left'`).

All SVG sources are in `prototype/icons.jsx` — copy paths directly into `react-native-svg`'s `<Path>` components.

---

## Platform notes (React Native)

| Web prototype uses | RN substitute |
|---|---|
| `box-shadow` (multi-layer) | `shadowColor/Offset/Opacity/Radius` (iOS) + `elevation` (Android). Multi-layer shadows are not supported — pick the strongest layer. |
| `backdrop-filter: blur(...)` | Use `expo-blur`'s `<BlurView>` for the glass pills in the hero. |
| `linear-gradient(...)` | `expo-linear-gradient`'s `<LinearGradient>`. |
| CSS keyframes | `react-native-reanimated`. |
| `cursor: pointer` | Remove — implicit on `Pressable`. |
| `transition: ...` | Reanimated `withTiming` / `withSpring`. |
| Inline `<svg>` | `react-native-svg` (`<Svg>`, `<Path>`, `<Rect>`, `<Circle>`, `<Defs>`, `<LinearGradient>`, `<ClipPath>`). |
| Google Fonts via `<link>` | Bundle `.ttf` via `expo-font`. |

---

## Assets

- **No raster image assets required.** Everything is SVG.
- The existing `frontend/assets/images/DollarSeeds-logo.svg` (and `dollar-seeds-logo.png` used in `index.tsx`) can be retired — the new "leaf in rounded tile" logo glyph is composed inline from `IconLeaf`. If keeping a wordmark file, redraw it in Instrument Serif at 600 weight to match the new system.
- Three font families to add to `frontend/assets/fonts/` (download from [Google Fonts](https://fonts.google.com/)):
  - Instrument Serif (Regular + Italic)
  - Geist (300, 400, 500, 600, 700)
  - JetBrains Mono (400, 500, 600)

---

## Files in this bundle

```
design_handoff_visual_revamp/
├── README.md                       ← this file
├── DollarSeeds Revamp.html         ← open this in a browser to see the live prototype
├── prototype/
│   ├── app.jsx                     ← top-level App + tab bar + Tweaks panel wiring
│   ├── screens.jsx                 ← all 5 screens + shared helpers (Card, ProgressBar, Amount, useTicker, getTheme, shadow)
│   ├── icons.jsx                   ← every custom SVG icon
│   ├── ios-frame.jsx               ← iPhone frame (purely for prototype scaffolding; not needed in RN)
│   └── tweaks-panel.jsx            ← Tweaks panel (not needed in production)
└── screenshots/
    ├── 01-dashboard-light.png      ← Light forest — primary palette
    ├── 02-expense-light.png
    ├── 03-income-light.png
    ├── 04-savings-light.png
    ├── 05-lessons-light.png
    ├── 06-dashboard-dark.png       ← Dark forest
    ├── 07-expense-dark.png
    ├── 08-income-dark.png
    ├── 09-savings-dark.png
    ├── 10-lessons-dark.png
    ├── 11-palette-sage.png         ← Dashboard in alt palettes
    ├── 12-palette-indigo.png
    └── 13-palette-plum.png
```

**Where to look first:**
1. **`screens.jsx`** — has the actual screen markup, helpers, and theme tokens (`getTheme` function). Most porting work happens here.
2. **`icons.jsx`** — SVG path data for every icon you'll port to `react-native-svg`.
3. **`DollarSeeds Revamp.html`** — open in a browser to view interactively. The Tweaks panel lets you preview alt palettes (sage, indigo, plum) and dark mode.

---

## Suggested porting order

1. **Theme** — extend `ThemeContext.tsx` with the new tokens. Verify dark mode swap still works.
2. **Fonts** — add the three font families to `frontend/assets/fonts/` and load via `expo-font` in `app/_layout.tsx`.
3. **Icons** — create `frontend/components/icons/` and port every SVG in `icons.jsx` to `react-native-svg`. Export an index for ergonomic imports.
4. **Shared primitives** — port `Card`, `ProgressBar`, `Amount` (with `useTicker` from Reanimated), `SectionLabel`, `HeroBg` (LinearGradient + leaf-flourish SVG with curved bottom) into `frontend/components/ui/`.
5. **Screens** — port one at a time in this order:
   1. Dashboard (most components reused after)
   2. Add Expense
   3. Add Income
   4. Piggy Bank / Savings (uses `SavingsJar` SVG — port the full SVG, it animates by recomputing `y` of the fill `<Rect>` from a Reanimated shared value)
   5. Lessons
6. **Tab bar** — replace the Expo Router `<Tabs>` `tabBarStyle` to render the new floating pill bar. Use `tabBarBackground` (BlurView) + `tabBarLabel` + `tabBarIcon` overrides. May require a custom tab bar via `screenOptions={{ tabBar: () => <CustomTabBar/> }}` if the default Tabs component can't go fully edge-floating.

---

## Behavior preservation checklist

- [ ] Month navigation (left/right chevrons cycle through 12 months, fetch new data on change)
- [ ] Verse modal still fires when `allGreen` for the first time per month (re-skin the modal with the new design)
- [ ] Logout via the iconBtn / Pressable in the header still calls `supabase.auth.signOut()`
- [ ] All three category cards still navigate to `/details` with the right `category` + `month` + `type` params
- [ ] "Spending Trends" still navigates to `/trends`
- [ ] Piggy bank: tabs (active/completed) still filter `goals` vs `completedGoals`
- [ ] Goal form still POSTs to `/savings/goal/`, deletes still DELETE
- [ ] Deposit/withdrawal forms render the existing `SavingsContainer` component
- [ ] Lesson card tap still navigates to `/lessonDetail?id=N`
- [ ] Star ratings still trigger the "share rating?" `Alert.alert` and POST to `/lesson-ratings/`
- [ ] Dark mode toggle still flips through `useTheme().toggleTheme()`

If you have questions about any specific component, refer to the live prototype HTML — open `DollarSeeds Revamp.html` in a browser, use the Tweaks panel to inspect different states, and read the corresponding section in `screens.jsx`.
