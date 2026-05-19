# Design System

## Theme Architecture

All design tokens live in a single context. Every screen and component must consume them via the hook — no hardcoded colors anywhere.

- Provider: [frontend/context/ThemeContext.tsx](../../frontend/context/ThemeContext.tsx:83) — `AppThemeProvider` wraps the whole app in `_layout.tsx`
- Hook: `useTheme()` returns `{ theme, isDark, toggleTheme }`
- `theme` is typed as `AppTheme` — see [ThemeContext.tsx:7](../../frontend/context/ThemeContext.tsx:7) for the full interface
- Backward-compat `Colors` export in [frontend/constants/theme.ts](../../frontend/constants/theme.ts) is only for expo-router's `ThemeProvider`; don't use it in screens

**Usage pattern in any new component:**
```
const { theme } = useTheme();
// then: style={{ color: theme.text, backgroundColor: theme.surface }}
```

---

## Color Tokens

### Semantic Surfaces
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `background` | `#F8FAFC` | `#0F172A` | Page/ScrollView bg |
| `surface` | `#FFFFFF` | `#1E293B` | Cards, modals, tab bar |
| `surfaceElevated` | `#FFFFFF` | `#293548` | Dropdowns, popovers |
| `border` | `#E2E8F0` | `#334155` | Card borders, dividers |
| `borderSubtle` | `#F1F5F9` | `#1E293B` | Row separators |

### Text
| Token | Use |
|-------|-----|
| `text` | Primary labels, amounts |
| `textSecondary` | Section headers, form labels |
| `textMuted` | Dates, hints, empty states |

### Action & Status
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `action` | `#2563EB` | `#3B82F6` | Buttons, links, progress bars |
| `danger` | `#DC2626` | `#EF4444` | Delete, overspend, errors |
| `success` | `#16A34A` | `#22C55E` | Completed goals, positive amounts |

### Budget Categories (color-theory rationale)
| Token | Color | Why |
|-------|-------|-----|
| `needs` / `needsSoft` | Amber `#F59E0B` | Warm, grounding — practical necessities |
| `wants` / `wantsSoft` | Violet `#8B5CF6` | Creative, pleasurable — lifestyle & enjoyment |
| `goals` / `goalsSoft` | Emerald `#10B981` | Growth, prosperity — future progress |

`*Soft` tokens are tinted backgrounds for banners and subtle highlights.

---

## Button Component

[frontend/components/ui/Button.jsx](../../frontend/components/ui/Button.jsx)

```
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
| `primary` | `theme.action` | white | Main CTA |
| `secondary` | `theme.actionSoft` | `theme.action` | Secondary action |
| `danger` | `theme.danger` | white | Destructive action |
| `dangerSoft` | `theme.dangerSoft` | `theme.danger` | Soft destructive |
| `success` | `theme.success` | white | Confirmation, post-submit feedback |
| `outline` | transparent | `color` or `theme.action` | Category-colored actions |
| `ghost` | transparent | `color` or `theme.action` | Tertiary / de-emphasized |

For category-colored outline buttons (e.g. "View Need Expenses"), pass `color={theme.needs}`.

---

## InputField & Dropdown

Both read from `useTheme()` and apply `inputBg`, `inputBorder`, `inputText`, `inputPlaceholder` tokens automatically. No style props needed from callers.

- [frontend/components/ui/InputField.jsx](../../frontend/components/ui/InputField.jsx)
- [frontend/components/ui/Dropdown.jsx](../../frontend/components/ui/Dropdown.jsx)

Labels are rendered as small uppercase caps (`fontSize: 13, fontWeight: 600, letterSpacing: 0.5`).

---

## Dark Mode

- Defaults to system preference via `useColorScheme()` from `react-native`
- User override: 🌙/☀️ `Pressable` in the dashboard logo row — calls `toggleTheme()`
- Toggle location: [frontend/app/(tabs)/index.tsx:154](../../frontend/app/(tabs)/index.tsx:154)

---

## SVG Logo

The dashboard logo ([frontend/assets/images/DollarSeeds-logo.svg](../../frontend/assets/images/DollarSeeds-logo.svg)) is imported as a React component via the SVG transformer pipeline.

- Metro config: [frontend/metro.config.js](../../frontend/metro.config.js) — strips `svg` from assets, adds to sources
- TypeScript declaration: [frontend/declarations.d.ts](../../frontend/declarations.d.ts)
- Import pattern: `import DollarSeedsLogo from '../../assets/images/DollarSeeds-logo.svg'`
- Render: `<DollarSeedsLogo width={36} height={36} />`
- **After editing metro.config.js, always restart with `npm start -- --clear`**
