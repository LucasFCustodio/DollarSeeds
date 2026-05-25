// DollarSeeds custom icon library — botanical + geometric duotone
// All icons are 24×24 viewBox; pass size & color via props.

function Icon({ children, size = 24, color = 'currentColor', accent, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      {children}
    </svg>
  );
}

// ── Tab bar icons ──────────────────────────────────────────────
const IconHome = ({ size = 24, color = 'currentColor', accent, filled }) => (
  <Icon size={size}>
    {filled && <path d="M12 3.2L4 9.4v10.2a1.4 1.4 0 0 0 1.4 1.4h13.2a1.4 1.4 0 0 0 1.4-1.4V9.4L12 3.2z" fill={accent || color} opacity="0.18"/>}
    <path d="M4 10.2L12 3.8l8 6.4v9.4a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 19.6V10.2z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    {/* sprout coming out of the roof */}
    <path d="M12 7.2c0-1.2 0.9-2.1 2.1-2.1M12 7.2c0-1.2-0.9-2.1-2.1-2.1M12 3.8v3.4" stroke={accent || color} strokeWidth="1.6" strokeLinecap="round"/>
  </Icon>
);

const IconExpense = ({ size = 24, color = 'currentColor', accent, filled }) => (
  <Icon size={size}>
    {filled && <circle cx="12" cy="12" r="9" fill={accent || color} opacity="0.18"/>}
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6"/>
    <path d="M8 12h8M16 12l-3-3M16 12l-3 3" stroke={accent || color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);

const IconIncome = ({ size = 24, color = 'currentColor', accent, filled }) => (
  <Icon size={size}>
    {filled && <circle cx="12" cy="12" r="9" fill={accent || color} opacity="0.18"/>}
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6"/>
    <path d="M16 12H8M8 12l3-3M8 12l3 3" stroke={accent || color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);

const IconSavings = ({ size = 24, color = 'currentColor', accent, filled }) => (
  <Icon size={size}>
    {/* clay jar */}
    {filled && <path d="M5.5 10.5h13l-1.2 9a1.4 1.4 0 0 1-1.4 1.2H8.1a1.4 1.4 0 0 1-1.4-1.2l-1.2-9z" fill={accent || color} opacity="0.18"/>}
    <path d="M5.5 10.5h13l-1.2 9a1.4 1.4 0 0 1-1.4 1.2H8.1a1.4 1.4 0 0 1-1.4-1.2l-1.2-9z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M7.5 10.5V9a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1.5" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    {/* sprout */}
    <path d="M12 8V5.5M12 5.5c0-1 0.8-1.8 1.8-1.8M12 5.5c0-1-0.8-1.8-1.8-1.8" stroke={accent || color} strokeWidth="1.6" strokeLinecap="round"/>
  </Icon>
);

const IconLessons = ({ size = 24, color = 'currentColor', accent, filled }) => (
  <Icon size={size}>
    {filled && <path d="M4 5.5a1.5 1.5 0 0 1 1.5-1.5H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5v-10z" fill={accent || color} opacity="0.18"/>}
    <path d="M12 6a2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 0 0-2 2V6z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M12 6a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 0 4 5.5v10A1.5 1.5 0 0 0 5.5 17H10a2 2 0 0 1 2 2V6z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    {/* leaf bookmark */}
    <path d="M16 4c-0.5 1.5-0.5 3 0.5 4.5C17.5 7 17.5 5.5 16 4z" fill={accent || color}/>
  </Icon>
);

// ── Category icons ─────────────────────────────────────────────
// Needs — bread loaf (essentials, sustenance)
const IconNeeds = ({ size = 28, color = '#0F2820', accent = '#D97706' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M5 15c0-2.8 2.5-5 6-5h10c3.5 0 6 2.2 6 5v1.5c0 0.6-0.4 1-1 1H6c-0.6 0-1-0.4-1-1V15z" fill={accent} opacity="0.22"/>
    <path d="M5 15c0-2.8 2.5-5 6-5h10c3.5 0 6 2.2 6 5v1.5c0 0.6-0.4 1-1 1H6c-0.6 0-1-0.4-1-1V15z" stroke={accent} strokeWidth="1.6"/>
    <path d="M7 17.5v5.5c0 0.6 0.4 1 1 1h16c0.6 0 1-0.4 1-1v-5.5" stroke={accent} strokeWidth="1.6"/>
    <path d="M11 14l1-2M16 14l1-2M21 14l1-2" stroke={accent} strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

// Wants — flame / desire
const IconWants = ({ size = 28, color = '#0F2820', accent = '#7C3AED' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M16 4s-7 5.5-7 12a7 7 0 1 0 14 0c0-3-1.5-5-3-6.5 0 2-1 3-2 3 0-3.5-1-6-2-8.5z" fill={accent} opacity="0.2"/>
    <path d="M16 4s-7 5.5-7 12a7 7 0 1 0 14 0c0-3-1.5-5-3-6.5 0 2-1 3-2 3 0-3.5-1-6-2-8.5z" stroke={accent} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M13 19a3 3 0 1 0 6 0c0-1.5-1-2.5-2-3-0.2 0.9-0.8 1.4-1.5 1.4-0.5-1-1-2-2.5-2-0.3 1.2 0 2.5 0 3.6z" fill={accent}/>
  </svg>
);

// Goals — sprout in soil
const IconGoals = ({ size = 28, color = '#0F2820', accent = '#0F8C5C' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M5 23h22l-1 4H6l-1-4z" fill={accent} opacity="0.22"/>
    <path d="M5 23h22l-1 4H6l-1-4z" stroke={accent} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M16 23V13" stroke={accent} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M16 17c0-3 2.5-5.5 5.5-5.5C21.5 14.5 19 17 16 17z" fill={accent}/>
    <path d="M16 13c0-2.5-2-4.5-4.5-4.5C11.5 11 13.5 13 16 13z" fill={accent} opacity="0.8"/>
  </svg>
);

// ── Misc icons ─────────────────────────────────────────────────
const IconChevronLeft = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}><path d="M14 6l-6 6 6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
const IconChevronRight = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}><path d="M10 6l6 6-6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
const IconChevronDown = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}><path d="M6 9l6 6 6-6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
const IconChevronUp = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}><path d="M6 15l6-6 6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
const IconPlus = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}><path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2" strokeLinecap="round"/></Icon>
);
const IconClose = ({ size = 16, color = 'currentColor' }) => (
  <Icon size={size}><path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth="1.8" strokeLinecap="round"/></Icon>
);
const IconCheck = ({ size = 16, color = 'currentColor' }) => (
  <Icon size={size}><path d="M5 12l4.5 4.5L19 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
const IconBell = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}>
    <path d="M6 16h12l-1.5-2V10a4.5 4.5 0 1 0-9 0v4L6 16z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M10.5 19a1.5 1.5 0 0 0 3 0" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
  </Icon>
);
const IconUser = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}>
    <circle cx="12" cy="9" r="3.5" stroke={color} strokeWidth="1.6"/>
    <path d="M5 20c1-3.5 4-5 7-5s6 1.5 7 5" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
  </Icon>
);
const IconCalendar = ({ size = 18, color = 'currentColor' }) => (
  <Icon size={size}>
    <rect x="4" y="6" width="16" height="14" rx="2" stroke={color} strokeWidth="1.6"/>
    <path d="M4 10h16M9 3v4M15 3v4" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
  </Icon>
);
const IconStar = ({ size = 22, color = '#D4B254', filled }) => (
  <Icon size={size}>
    <path d="M12 3l2.7 5.6 6.1 0.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-0.9L12 3z"
      fill={filled ? color : 'none'} stroke={color} strokeWidth="1.4" strokeLinejoin="round"/>
  </Icon>
);
const IconTrash = ({ size = 16, color = 'currentColor' }) => (
  <Icon size={size}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);
const IconEdit = ({ size = 16, color = 'currentColor' }) => (
  <Icon size={size}>
    <path d="M4 20h4l10-10-4-4L4 16v4z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M14 6l4 4" stroke={color} strokeWidth="1.6"/>
  </Icon>
);
const IconLeaf = ({ size = 24, color = '#0F8C5C' }) => (
  <Icon size={size}>
    <path d="M4 20c0-9 7-16 16-16-1 8-8 16-16 16z" fill={color} opacity="0.18"/>
    <path d="M4 20c0-9 7-16 16-16-1 8-8 16-16 16z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M4 20c4-5 8-9 14-12" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
  </Icon>
);
const IconSparkle = ({ size = 16, color = 'currentColor' }) => (
  <Icon size={size}>
    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" fill={color}/>
  </Icon>
);
const IconTrend = ({ size = 18, color = 'currentColor' }) => (
  <Icon size={size}>
    <path d="M3 16l5-5 4 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 7h4v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);
const IconScripture = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M5 17a3 3 0 0 1 3-3h11" stroke={color} strokeWidth="1.6"/>
    <path d="M12 8v3M10.5 9.5h3" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
  </Icon>
);
const IconMoon = ({ size = 18, color = 'currentColor' }) => (
  <Icon size={size}><path d="M19 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" fill={color}/></Icon>
);
const IconSun = ({ size = 18, color = 'currentColor' }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="4" fill={color}/>
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
  </Icon>
);
const IconTarget = ({ size = 20, color = 'currentColor' }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.6"/>
    <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.6"/>
    <circle cx="12" cy="12" r="1.2" fill={color}/>
  </Icon>
);
const IconArrow = ({ size = 16, color = 'currentColor', dir = 'up' }) => {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir] || 0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M12 5v14M12 5l-5 5M12 5l5 5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

// ── Tiny expense category glyphs (used in transaction rows) ────
const GlyphHouse = ({ color = '#D97706' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9z" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M10 21v-6h4v6" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
  </svg>
);
const GlyphCart = ({ color = '#D97706' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M3 4h2.5l2 12h11l2-8H7" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="9" cy="20" r="1.4" fill={color}/>
    <circle cx="17" cy="20" r="1.4" fill={color}/>
  </svg>
);
const GlyphCar = ({ color = '#D97706' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M3 14l1.5-5a2 2 0 0 1 2-1.5h11a2 2 0 0 1 2 1.5L21 14v4h-2v-2H5v2H3v-4z" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
    <circle cx="7.5" cy="14" r="1.2" fill={color}/>
    <circle cx="16.5" cy="14" r="1.2" fill={color}/>
  </svg>
);
const GlyphCoffee = ({ color = '#7C3AED' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M5 9h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" stroke={color} strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M17 11h2a2 2 0 0 1 0 4h-2" stroke={color} strokeWidth="1.7"/>
    <path d="M8 6c1-1 1-2 0-3M12 6c1-1 1-2 0-3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const GlyphFilm = ({ color = '#7C3AED' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="14" rx="1.5" stroke={color} strokeWidth="1.7"/>
    <path d="M3 9h3M3 15h3M18 9h3M18 15h3M7 5v14M17 5v14" stroke={color} strokeWidth="1.5"/>
  </svg>
);
const GlyphGift = ({ color = '#7C3AED' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="10" width="18" height="10" rx="1" stroke={color} strokeWidth="1.7"/>
    <path d="M3 13h18M12 10v10" stroke={color} strokeWidth="1.7"/>
    <path d="M12 10s-2-4-4.5-4-2.5 4 1 4h3.5zM12 10s2-4 4.5-4 2.5 4-1 4H12z" stroke={color} strokeWidth="1.7"/>
  </svg>
);
const GlyphSeed = ({ color = '#0F8C5C' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <ellipse cx="12" cy="14" rx="6" ry="7" fill={color} opacity="0.22"/>
    <ellipse cx="12" cy="14" rx="6" ry="7" stroke={color} strokeWidth="1.6"/>
    <path d="M12 14c0-3 1.5-5 4-6" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const GlyphBriefcase = ({ color = '#0F3D2E' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="8" width="18" height="12" rx="1.5" stroke={color} strokeWidth="1.7"/>
    <path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={color} strokeWidth="1.7"/>
    <path d="M3 13h18" stroke={color} strokeWidth="1.5"/>
  </svg>
);

Object.assign(window, {
  IconHome, IconExpense, IconIncome, IconSavings, IconLessons,
  IconNeeds, IconWants, IconGoals,
  IconChevronLeft, IconChevronRight, IconChevronDown, IconChevronUp,
  IconPlus, IconClose, IconCheck, IconBell, IconUser, IconCalendar,
  IconStar, IconTrash, IconEdit, IconLeaf, IconSparkle, IconTrend,
  IconScripture, IconMoon, IconSun, IconTarget, IconArrow,
  GlyphHouse, GlyphCart, GlyphCar, GlyphCoffee, GlyphFilm, GlyphGift, GlyphSeed, GlyphBriefcase,
});
