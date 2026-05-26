# Design System — "Seed & Soil"

The visual revamp replaced the flat slate/blue system with a warm "Seed & Soil" identity: cream backgrounds, forest green brand, Instrument Serif display type, and botanical SVG iconography.

## Theme Architecture

All design tokens live in a single context. Every screen and component must consume them via the hook — no hardcoded colors anywhere.

- Provider: [frontend/context/ThemeContext.tsx](../../frontend/context/ThemeContext.tsx) — `AppThemeProvider` wraps the whole app in `_layout.tsx`
- Hook: `useTheme()` returns `{ theme, isDark, toggleTheme }`
- Shadow helper: `shadow(depth)` is exported from the same file (see [Shadow Scale](#shadow-scale) below)
- Font constants: `Fonts` object exported from `ThemeContext.tsx` — use `Fonts.serif`, `Fonts.sans`, etc.
- `theme` is typed as `AppTheme` — see [ThemeContext.tsx:30](../../frontend/context/ThemeContext.tsx:30) for the full interface

**Usage pattern in any new component:**
```tsx
import { useTheme, shadow, Fonts } from '../../context/ThemeContext';

const { theme } = useTheme();
// surfaces:  style={{ backgroundColor: theme.bg }}
// cards:     style={{ backgroundColor: theme.surface, ...shadow(6) }}
// text:      style={{ color: theme.ink, fontFamily: Fonts.serif }}
```

---

## Color Tokens

### Surfaces
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `bg` | `#F5F1E6` (warm cream) | `#0A1612` | Page / ScrollView background |
| `surface` | `#FFFFFF` | `#13231C` | Cards, modals, tab bar |
| `surfaceSoft` | `#FAF6EB` | `#1A2D24` | Pressed state, input backgrounds |
| `surfaceElev` | `#FFFFFF` | `#1E332A` | Dropdowns, popovers |
| `border` | `#E5DDC9` | `#1F3A2E` | Subtle card borders (depth ≤ 2) |
| `borderSoft` | `#EFE9D8` | `#162720` | Row separators |

### Text (ink scale)
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `ink` | `#0F2820` | `#F4F1E8` | Primary labels, amounts |
| `ink2` | `#4A5C56` | `#9BB1A5` | Section headers, form labels |
| `ink3` | `#8FA39C` | `#6A8478` | Dates, hints, empty states |

### Brand
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `brand` | `#0F3D2E` (forest) | `#0F3D2E` | Buttons, active tab, progress fill |
| `brand2` | `#10B981` (emerald) | `#10B981` | Gradient end, goals color |
| `brandSoft` | `#E8F3EE` | `#0F2A20` | Secondary buttons, active-tab pill bg |
| `onBrand` | `#FFFFFF` | `#FFFFFF` | Text on brand-colored backgrounds |

### Budget Categories
| Token | Light | Dark | Why |
|-------|-------|------|-----|
| `needs` / `needsSoft` | `#C2701C` / `#FBEDD9` | `#F4B860` / `#2C2010` | Warm amber — practical necessities |
| `wants` / `wantsSoft` | `#7C3AED` / `#EFE6FB` | `#B898F7` / `#1F1830` | Violet — lifestyle & enjoyment |
| `goals` / `goalsSoft` | `#10B981` / `#E8F3EE` | `#34D399` / `#0F2A20` | Emerald — future growth (matches brand2) |

### Status & Accent
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `danger` / `dangerSoft` | `#B91C1C` / `#FBE7E7` | `#F87171` / `#2C1818` | Delete, overspend |
| `success` / `successSoft` | `#0F8C5C` / `#E5F3EC` | `#34D399` / `#0F2A20` | Completed goals, positive balances |
| `harvest` | `#F4D35E` | `#F4D35E` | Budget-health bar, savings jar fill |

### Legacy Aliases (backward-compat — prefer new tokens in new code)
| Alias | Maps to |
|-------|---------|
| `background` | `bg` |
| `surfaceElevated` | `surfaceElev` |
| `borderSubtle` | `borderSoft` |
| `text` | `ink` |
| `textSecondary` | `ink2` |
| `textMuted` | `ink3` |
| `action` | `brand` (forest, not the old blue `#2563EB`) |
| `actionSoft` | `brandSoft` |
| `inputBg/Border/Text/Placeholder` | surfaceSoft / border / ink / ink3 |

---

## Typography

Three font families are bundled in [frontend/assets/fonts/](../../frontend/assets/fonts/) and loaded via `expo-font` in [frontend/app/_layout.tsx](../../frontend/app/_layout.tsx).

Use the `Fonts` export from `ThemeContext.tsx` rather than raw string names:

```ts
import { Fonts } from '../../context/ThemeContext';

// Fonts.serif         → 'InstrumentSerif-Regular'
// Fonts.serifItalic   → 'InstrumentSerif-Italic'
// Fonts.sans          → 'Geist-Regular'
// Fonts.sansMedium    → 'Geist-Medium'
// Fonts.sansSemiBold  → 'Geist-SemiBold'
// Fonts.sansBold      → 'Geist-Bold'
// Fonts.mono          → 'JetBrainsMono-Regular'
// Fonts.monoMedium    → 'JetBrainsMono-Medium'
// Fonts.monoSemiBold  → 'JetBrainsMono-SemiBold'
```

### Type Scale

| Role | Family | Size | Weight | Used for |
|------|--------|------|--------|----------|
| Display XL | Instrument Serif | 72 | 400 | Income amount card |
| Display L | Instrument Serif | 64 | 400 | Dashboard hero amount, Expense amount |
| Display M | Instrument Serif | 48 | 400 | Savings balance |
| Display S | Instrument Serif | 36 | 400 | Lessons page title |
| Heading | Instrument Serif | 26 | 400 | Screen titles ("New Expense") |
| Amount | Instrument Serif | 22 | 400 | Category card "left" amount |
| Body | Geist | 14 | 400 | General UI text |
| Title | Geist | 15–16 | 600 | Card titles, section headers |
| Subtitle | Geist | 13 | 400 | Card descriptions |
| Caption | Geist | 12 | 500 | Small labels |
| Eyebrow | JetBrains Mono | 10–11 | 600 | Uppercase section labels (letter-spacing: 0.16em) |
| Meta | JetBrains Mono | 11 | 400 | Dates, `Apr 15`, inline `$` amounts |

---

## Shadow Scale

`shadow(depth)` is exported from `ThemeContext.tsx`. Call it with a depth from 0–10 and spread into a style:

```tsx
import { shadow } from '../../context/ThemeContext';
// ...
style={{ ...shadow(7) }}
```

| Depth | Use |
|-------|-----|
| 0 | No shadow (flat) |
| 2–3 | Compact transaction rows |
| 5 | Amount / income cards |
| 6 | Tab bar, default `<Card>` |
| 7 | Category cards, hero cards |
| 10 | Maximum elevation |

Cards at depth ≤ 2 automatically get a 1px `border` instead of a shadow.

---

## UI Components

### `<Card>`
[frontend/components/ui/Card.tsx](../../frontend/components/ui/Card.tsx)

Soft surface card with depth-based shadow. Renders as `Pressable` (with a scale-down press effect) when `onPress` is provided, otherwise as `View`.

```tsx
<Card theme={theme} depth={7} padding={18} onPress={...}>
  {/* children */}
</Card>
```

| Prop | Default | Notes |
|------|---------|-------|
| `depth` | `6` | Shadow depth 0–10 |
| `padding` | `18` | Inner padding |
| `onPress` | — | Makes card tappable with 0.97 scale press feedback |
| `style` | — | Additional `ViewStyle` overrides |

### `<AnimatedAmount>`
[frontend/components/ui/AnimatedAmount.tsx](../../frontend/components/ui/AnimatedAmount.tsx)

Number-ticker display in Instrument Serif. Animates from 0 → value over 900ms on mount.

```tsx
<AnimatedAmount value={2450} prefix="$" size={64} color={theme.onBrand} decimals={0} />
```

| Prop | Default | Notes |
|------|---------|-------|
| `value` | required | Target number |
| `prefix` | `'$'` | |
| `size` | `56` | Font size |
| `color` | `'#0F2820'` | Pass `theme.ink` or `theme.onBrand` |
| `animate` | `true` | Set `false` to skip ticker |
| `decimals` | `0` | |

### `<AnimatedProgressBar>`
[frontend/components/ui/AnimatedProgressBar.tsx](../../frontend/components/ui/AnimatedProgressBar.tsx)

Fills from 0 → target percent over 1100ms with a category-colored glow on iOS.

```tsx
<AnimatedProgressBar percent={68} color={theme.needs} height={8} />
```

### `<HeroBg>`
[frontend/components/ui/HeroBg.tsx](../../frontend/components/ui/HeroBg.tsx)

Gradient hero header with curved bottom corners and a leaf-flourish SVG overlay. Used at the top of Dashboard and Piggy Bank screens.

```tsx
<HeroBg theme={theme}>{/* header content */}</HeroBg>
```

### `<CustomTabBar>`
[frontend/components/ui/CustomTabBar.tsx](../../frontend/components/ui/CustomTabBar.tsx)

Floating pill tab bar. Active tab icon container animates via Reanimated spring (`damping: 12, stiffness: 200`) into a brand-filled pill. Floats 16px from screen edges, 14px (+ safe-area) from bottom.

Registered in [frontend/app/(tabs)/_layout.tsx](../../frontend/app/(tabs)/_layout.tsx) via:
```tsx
screenOptions={{ tabBar: (props) => <CustomTabBar {...props} /> }}
```

Do not use `tabBarStyle`, `tabBarIcon`, or `tabBarActiveTintColor` overrides — those target the default Expo tab bar that is no longer in use.

---

## Icons

All app icons are custom botanical SVG glyphs at [frontend/components/icons/](../../frontend/components/icons/).

```tsx
import { IconNeeds, IconHome, IconLeaf, GlyphHouse } from '../../components/icons';
// or for tab bar icons: imported internally by CustomTabBar
```

Every icon accepts `{ size?, color?, accent?, filled? }`. The `filled` prop activates the tab-active variant.

| Group | Components | Use |
|-------|-----------|-----|
| Tab bar (24×24) | `IconHome`, `IconExpense`, `IconIncome`, `IconSavings`, `IconLessons` | Used by `CustomTabBar` |
| Category (32×32) | `IconNeeds` (bread loaf), `IconWants` (flame), `IconGoals` (sprout) | Category card headers |
| Transaction glyphs (20×20) | `GlyphHouse`, `GlyphCart`, `GlyphCar`, `GlyphCoffee`, `GlyphFilm`, `GlyphGift`, `GlyphSeed`, `GlyphBriefcase` | Expense transaction rows |
| Utility | `IconChevronLeft/Right/Up/Down`, `IconPlus`, `IconClose`, `IconCheck`, `IconBell`, `IconLeaf`, `IconSparkle`, `IconTrend`, `IconStar`, `IconMoon`, `IconSun`, `IconTarget`, `IconArrow`, … | General UI |

---

## Button Component

[frontend/components/ui/Button.jsx](../../frontend/components/ui/Button.jsx)

```tsx
<Button
  label="string"
  variant="primary" | "secondary" | "danger" | "dangerSoft" | "success" | "outline" | "ghost"
  size="sm" | "md" | "lg"
  fullWidth={boolean}
  color="#hex"        // optional: overrides border/text color on outline/ghost
  onPress={fn}
  disabled={boolean}
/>
```

| Variant | Background | Text | When to use |
|---------|-----------|------|-------------|
| `primary` | `theme.brand` | `theme.onBrand` | Main CTA ("Log Expense") |
| `secondary` | `theme.brandSoft` | `theme.brand` | Secondary action |
| `danger` | `theme.danger` | white | Destructive action |
| `dangerSoft` | `theme.dangerSoft` | `theme.danger` | Soft destructive |
| `success` | `theme.success` | white | Confirmation |
| `outline` | transparent | `color` or `theme.brand` | Category-colored actions |
| `ghost` | transparent | `color` or `theme.brand` | Tertiary / de-emphasized |

For category-colored outline buttons, pass `color={theme.needs}` / `theme.wants` / `theme.goals`.

---

## InputField & Dropdown

Both read from `useTheme()` and apply `inputBg`, `inputBorder`, `inputText`, `inputPlaceholder` tokens automatically. No style props needed from callers.

- [frontend/components/ui/InputField.jsx](../../frontend/components/ui/InputField.jsx)
- [frontend/components/ui/Dropdown.jsx](../../frontend/components/ui/Dropdown.jsx)

Labels are rendered as eyebrow caps (`JetBrains Mono, 11px, 600, letterSpacing: 0.16em`).

---

## Dark Mode

- Defaults to system preference via `useColorScheme()` from `react-native`
- User override: 🌙/☀️ `Pressable` in the dashboard hero header — calls `toggleTheme()`
- Toggle location: [frontend/app/(tabs)/index.tsx](../../frontend/app/(tabs)/index.tsx) (hero header row)

---

## Radii Reference

| Value | Used for |
|-------|----------|
| 10 | Sub-tiles inside cards |
| 12–14 | Buttons, input fields, icon tiles |
| 18 | Card default (matches `<Card>`) |
| 24 | Tab bar (`CustomTabBar`) |
| 32 | Hero bottom curve (`HeroBg`) |
| 999 | Pills, chips, progress bar caps |
