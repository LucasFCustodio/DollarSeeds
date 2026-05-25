// DollarSeeds — shared design helpers + screens
// Expects: React, all icons on window, useTweaks from tweaks-panel.jsx

const { useState, useEffect, useRef, useMemo } = React;

// ── Number ticker hook ─────────────────────────────────────────
function useTicker(target, { duration = 900, animate = true } = {}) {
  const [value, setValue] = useState(animate ? 0 : target);
  const startRef = useRef(null);
  const fromRef = useRef(animate ? 0 : target);
  useEffect(() => {
    if (!animate) { setValue(target); return; }
    const from = fromRef.current;
    startRef.current = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate, duration]);
  return value;
}

function fmt$(n, { decimals = 0 } = {}) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Theme tokens ───────────────────────────────────────────────
function getTheme(t) {
  const dark = t.dark;
  const palette = {
    forest: { brand: '#0F3D2E', brand2: '#10B981', brandSoft: '#E8F3EE' },
    sage:   { brand: '#3B6B4F', brand2: '#7FB897', brandSoft: '#EEF4EF' },
    indigo: { brand: '#1E3A8A', brand2: '#60A5FA', brandSoft: '#E8EEFB' },
    plum:   { brand: '#4A1D4E', brand2: '#C084FC', brandSoft: '#F2E9F4' },
  }[t.palette] || { brand: '#0F3D2E', brand2: '#10B981', brandSoft: '#E8F3EE' };

  if (dark) {
    return {
      ...palette,
      bg: '#0A1612', surface: '#13231C', surfaceSoft: '#1A2D24', surfaceElev: '#1E332A',
      border: '#1F3A2E', borderSoft: '#162720',
      ink: '#F4F1E8', ink2: '#9BB1A5', ink3: '#6A8478',
      needs: '#F4B860', needsSoft: '#2C2010',
      wants: '#B898F7', wantsSoft: '#1F1830',
      goals: palette.brand2, goalsSoft: '#0F2A20',
      danger: '#F87171', dangerSoft: '#2C1818',
      success: '#34D399', successSoft: '#0F2A20',
      onBrand: '#FFFFFF',
    };
  }
  return {
    ...palette,
    bg: '#F5F1E6', surface: '#FFFFFF', surfaceSoft: '#FAF6EB', surfaceElev: '#FFFFFF',
    border: '#E5DDC9', borderSoft: '#EFE9D8',
    ink: '#0F2820', ink2: '#4A5C56', ink3: '#8FA39C',
    needs: '#C2701C', needsSoft: '#FBEDD9',
    wants: '#7C3AED', wantsSoft: '#EFE6FB',
    goals: palette.brand2, goalsSoft: palette.brandSoft,
    danger: '#B91C1C', dangerSoft: '#FBE7E7',
    success: '#0F8C5C', successSoft: '#E5F3EC',
    onBrand: '#FFFFFF',
  };
}

// ── Shadows by depth level ─────────────────────────────────────
function shadow(depth) {
  const d = Math.max(0, Math.min(10, depth));
  if (d === 0) return 'none';
  const l1 = `0 ${1 + d * 0.2}px ${2 + d * 0.6}px rgba(15,40,32,${0.04 + d * 0.005})`;
  const l2 = `0 ${4 + d * 0.8}px ${12 + d * 2.2}px rgba(15,40,32,${0.04 + d * 0.008})`;
  const l3 = d >= 5 ? `, 0 ${10 + d * 1.5}px ${30 + d * 3}px rgba(15,40,32,${0.02 + d * 0.005})` : '';
  return `${l1}, ${l2}${l3}`;
}

// ── Curved hero header bg ──────────────────────────────────────
function HeroBg({ brand, brand2, height = 280, children, style }) {
  return (
    <div style={{
      position: 'relative',
      background: `linear-gradient(160deg, ${brand} 0%, ${brand} 45%, ${brand2} 130%)`,
      borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
      paddingBottom: 36, overflow: 'hidden',
      ...style,
    }}>
      {/* leaf flourish */}
      <svg viewBox="0 0 400 280" style={{ position: 'absolute', right: -20, top: -10, width: 220, opacity: 0.09 }}>
        <path d="M380 40c-60 0-160 30-200 100-30 50-50 80-50 120 80 0 160-30 200-90 30-45 50-80 50-130z" fill="#fff"/>
        <path d="M380 40c-50 30-110 80-150 130-30 40-50 70-70 90" stroke="#fff" strokeWidth="1.5" fill="none"/>
      </svg>
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', left: -10, bottom: 10, width: 100, opacity: 0.07 }}>
        <circle cx="50" cy="50" r="40" fill="#fff"/>
      </svg>
      {children}
    </div>
  );
}

// ── Soft card ──────────────────────────────────────────────────
function Card({ children, style, theme, depth = 6, padding = 18, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: theme.surface,
      borderRadius: 18,
      padding,
      boxShadow: shadow(depth),
      border: depth <= 2 ? `1px solid ${theme.border}` : 'none',
      transition: 'transform 220ms ease, box-shadow 220ms ease',
      ...style,
    }}>{children}</div>
  );
}

// ── Animated progress bar ──────────────────────────────────────
function ProgressBar({ value, color, bg, height = 8, animate = true }) {
  const v = useTicker(value, { animate, duration: 1100 });
  return (
    <div style={{ height, background: bg, borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, v))}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${color} 0%, ${color} 70%, ${color}cc 100%)`,
        borderRadius: 999,
        boxShadow: `0 0 12px ${color}55`,
      }}/>
    </div>
  );
}

// ── Big animated amount ────────────────────────────────────────
function Amount({ value, prefix = '$', size = 56, color, animate = true, weight = 400 }) {
  const v = useTicker(value, { animate, duration: 900 });
  return (
    <span style={{
      fontFamily: '"Instrument Serif", Georgia, serif',
      fontSize: size, fontWeight: weight, lineHeight: 1,
      letterSpacing: '-0.02em', color,
    }}>{prefix}{fmt$(v)}</span>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  1. DASHBOARD                                                ║
// ╚══════════════════════════════════════════════════════════════╝
function DashboardScreen({ tweaks, theme, onNavigate }) {
  const [monthIdx, setMonthIdx] = useState(3);
  const [expandedCat, setExpandedCat] = useState(null);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const month = months[monthIdx];

  const data = {
    total_income: 5200,
    budgets: { needs: 2600, wants: 1560, goals: 1040 },
    expenses: { needs: 1840, wants: 1290, goals: 620 },
    score: 8.4,
    piggy: 1284.50,
  };
  const totalLeft = data.total_income - data.expenses.needs - data.expenses.wants - data.expenses.goals;

  const categories = [
    { key: 'needs', label: 'Needs', pct: '50%', icon: IconNeeds, color: theme.needs, soft: theme.needsSoft,
      spent: data.expenses.needs, budget: data.budgets.needs, sub: 'Rent, groceries, bills',
      items: [
        { name: 'Rent', amt: 1200, icon: GlyphHouse, day: 1 },
        { name: 'Groceries', amt: 380, icon: GlyphCart, day: 14 },
        { name: 'Gas & transit', amt: 260, icon: GlyphCar, day: 22 },
      ]},
    { key: 'wants', label: 'Wants', pct: '30%', icon: IconWants, color: theme.wants, soft: theme.wantsSoft,
      spent: data.expenses.wants, budget: data.budgets.wants, sub: 'Lifestyle, treats, fun',
      items: [
        { name: 'Coffee shops', amt: 86, icon: GlyphCoffee, day: 19 },
        { name: 'Streaming', amt: 42, icon: GlyphFilm, day: 5 },
        { name: 'Gift for mom', amt: 65, icon: GlyphGift, day: 11 },
      ]},
    { key: 'goals', label: 'Goals', pct: '20%', icon: IconGoals, color: theme.goals, soft: theme.goalsSoft,
      spent: data.expenses.goals, budget: data.budgets.goals, sub: 'Savings + debt paydown',
      items: [
        { name: 'Emergency fund', amt: 420, icon: GlyphSeed, day: 1 },
        { name: 'Student loan', amt: 200, icon: GlyphBriefcase, day: 15 },
      ]},
  ];

  return (
    <div style={{ background: theme.bg, minHeight: '100%', paddingBottom: 110 }}>
      {/* Hero */}
      <HeroBg brand={theme.brand} brand2={theme.brand2}>
        <div style={{ padding: '52px 22px 0', position: 'relative', zIndex: 1 }}>
          {/* Top row — logo & controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: 'rgba(255,255,255,0.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(8px)',
              }}>
                <IconLeaf size={22} color="#fff"/>
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>DollarSeeds</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>Sarah · steward</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <CircleIconBtn onClick={() => tweaks.setTweak('dark', !tweaks.dark)}>
                {tweaks.dark ? <IconSun color="#fff"/> : <IconMoon color="#fff"/>}
              </CircleIconBtn>
              <CircleIconBtn>
                <IconBell color="#fff"/>
                <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, background: '#F4D35E' }}/>
              </CircleIconBtn>
            </div>
          </div>

          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={() => setMonthIdx((monthIdx + 11) % 12)} style={pillBtn(theme)}>
              <IconChevronLeft color="#fff" size={16}/>
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, letterSpacing: '0.18em', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>BUDGET MONTH</div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 500, marginTop: 2, fontFamily: '"Instrument Serif", serif', letterSpacing: '0.01em' }}>
                {month} 2026
              </div>
            </div>
            <button onClick={() => setMonthIdx((monthIdx + 1) % 12)} style={pillBtn(theme)}>
              <IconChevronRight color="#fff" size={16}/>
            </button>
          </div>

          {/* Big amount */}
          <div style={{ textAlign: 'left', marginTop: 10 }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, letterSpacing: '0.12em', fontWeight: 600 }}>
              ${fmt$(data.total_income)} INCOME · LEFT TO LIVE
            </div>
            <div style={{ marginTop: 6 }}>
              <Amount value={totalLeft} color="#fff" size={64} animate={tweaks.animate}/>
              <div style={{ marginTop: 6 }}>
                <span style={{
                  background: 'rgba(255,255,255,0.18)', color: '#fff',
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
                  letterSpacing: '0.06em', display: 'inline-block',
                }}>left this month</span>
              </div>
            </div>
          </div>

          {/* Mini health pill */}
          <div style={{
            marginTop: 18,
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.12)', padding: '10px 14px', borderRadius: 14,
            backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)',
          }}>
            <IconSparkle size={16} color="#F4D35E"/>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Budget Health · {data.score}/10</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontStyle: 'italic', marginTop: 1 }}>Good discipline — keep it up</div>
            </div>
            <ProgressBar value={data.score * 10} color="#F4D35E" bg="rgba(255,255,255,0.15)" height={5}
              animate={tweaks.animate}/>
            <div style={{ width: 60 }}/>
          </div>
        </div>
      </HeroBg>

      {/* Content area */}
      <div style={{ padding: '20px 18px 0', marginTop: -16 }}>
        {/* Sticky scripture banner */}
        {tweaks.scriptureBanner && (
          <Card theme={theme} depth={Math.max(2, tweaks.depth - 2)} padding={14} style={{ marginBottom: 18, background: theme.surfaceSoft }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: theme.brandSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <IconScripture color={theme.brand} size={20}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 16, color: theme.ink, lineHeight: 1.3, fontStyle: 'italic', minHeight: 21 }}>
                  “Little by little, it grows.”
                </div>
                <div style={{ fontSize: 11, color: theme.ink3, marginTop: 8, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em' }}>Proverbs 13:11</div>
              </div>
            </div>
          </Card>
        )}

        {/* Section: 50 / 30 / 20 */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, letterSpacing: '-0.01em' }}>
            How your seeds are growing
          </div>
          <button onClick={() => onNavigate('trends')} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            color: theme.brand, fontSize: 12, fontWeight: 600,
          }}>
            <IconTrend size={14} color={theme.brand}/> Trends
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {categories.map(cat => (
            <CategoryCard key={cat.key} cat={cat} theme={theme} tweaks={tweaks}
              expanded={expandedCat === cat.key}
              onToggle={() => setExpandedCat(expandedCat === cat.key ? null : cat.key)}
              piggy={data.piggy}/>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => onNavigate('expense')} style={primaryBtn(theme)}>
            <IconExpense size={16} color="#fff"/> Log Expense
          </button>
          <button onClick={() => onNavigate('income')} style={secondaryBtn(theme)}>
            <IconIncome size={16} color={theme.brand}/> Log Income
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ cat, theme, tweaks, expanded, onToggle, piggy }) {
  const pct = (cat.spent / cat.budget) * 100;
  const left = cat.budget - cat.spent;
  const over = pct > 100;
  const barColor = over ? theme.danger : cat.color;
  const Ico = cat.icon;

  return (
    <Card theme={theme} depth={tweaks.depth} padding={0} style={{ overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: 16, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: cat.soft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Ico color={theme.ink} accent={cat.color} size={28}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: theme.ink, letterSpacing: '-0.01em' }}>{cat.label}</div>
              <div style={{ fontSize: 11, color: theme.ink3, fontFamily: 'JetBrains Mono, monospace' }}>{cat.pct}</div>
            </div>
            <div style={{ fontSize: 12, color: theme.ink2, marginTop: 2 }}>{cat.sub}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 22, color: theme.ink, fontWeight: 400, letterSpacing: '-0.02em' }}>
              ${fmt$(left)}
            </div>
            <div style={{ fontSize: 10, color: theme.ink3, letterSpacing: '0.1em', fontWeight: 600 }}>
              {over ? 'OVER' : 'LEFT'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={pct} color={barColor} bg={theme.borderSoft} animate={tweaks.animate}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: theme.ink3, fontFamily: 'JetBrains Mono, monospace' }}>
            <span>${fmt$(cat.spent)} spent</span>
            <span>of ${fmt$(cat.budget)}</span>
          </div>
        </div>
      </div>

      {/* Expanded items */}
      <div style={{
        maxHeight: expanded ? 400 : 0,
        overflow: 'hidden',
        transition: tweaks.animate ? 'max-height 320ms ease' : 'none',
        background: theme.surfaceSoft,
      }}>
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${theme.borderSoft}` }}>
          {cat.items.map((it, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0',
              borderBottom: i < cat.items.length - 1 ? `1px solid ${theme.borderSoft}` : 'none',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: theme.surface,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <it.icon color={cat.color}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: theme.ink, fontWeight: 500 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: theme.ink3, fontFamily: 'JetBrains Mono, monospace' }}>Apr {it.day}</div>
              </div>
              <div style={{ fontSize: 14, color: theme.ink, fontWeight: 500, fontFamily: 'JetBrains Mono, monospace' }}>
                −${fmt$(it.amt)}
              </div>
            </div>
          ))}
          {cat.key === 'goals' && (
            <div style={{
              marginTop: 10, padding: 12, borderRadius: 12,
              background: theme.brandSoft, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <IconSavings size={22} color={theme.brand} accent={theme.brand2}/>
              <div style={{ flex: 1, fontSize: 12, color: theme.brand, fontWeight: 600 }}>
                Piggy bank balance
              </div>
              <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 18, color: theme.brand }}>${fmt$(piggy, { decimals: 2 })}</div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  2. ADD EXPENSE                                              ║
// ╚══════════════════════════════════════════════════════════════╝
function ExpenseScreen({ theme, tweaks, onNavigate }) {
  const [amount, setAmount] = useState('48.50');
  const [category, setCategory] = useState('needs');
  const [title, setTitle] = useState('');
  const [subcat, setSubcat] = useState('Groceries');
  const [day, setDay] = useState(15);

  const cats = [
    { key: 'needs', label: 'Needs', icon: IconNeeds, color: theme.needs, soft: theme.needsSoft },
    { key: 'wants', label: 'Wants', icon: IconWants, color: theme.wants, soft: theme.wantsSoft },
    { key: 'goals', label: 'Goals', icon: IconGoals, color: theme.goals, soft: theme.goalsSoft },
  ];

  const subcats = {
    needs: ['Rent', 'Groceries', 'Utilities', 'Transit', 'Insurance', 'Healthcare', 'Other'],
    wants: ['Dining', 'Coffee', 'Streaming', 'Shopping', 'Travel', 'Gifts', 'Other'],
    goals: ['Emergency', 'Retirement', 'Loan', 'Investing', 'Tithe', 'Other'],
  };

  const selected = cats.find(c => c.key === category);

  return (
    <div style={{ background: theme.bg, minHeight: '100%', paddingBottom: 120 }}>
      <ScreenHeader theme={theme} title="New Expense" subtitle="Plant where it counts" onBack={() => onNavigate('home')}/>

      <div style={{ padding: '0 20px' }}>
        {/* Amount display */}
        <Card theme={theme} depth={tweaks.depth} padding={28} style={{
          background: `linear-gradient(140deg, ${theme.brand} 0%, ${theme.brand2} 130%)`,
          marginBottom: 20, textAlign: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -40, top: -40, width: 200, opacity: 0.13 }}>
            <path d="M100 20c-30 30-60 60-60 100s30 60 60 60 60-30 60-60-30-70-60-100z" fill="#fff"/>
          </svg>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.18em', fontWeight: 600, marginBottom: 6 }}>AMOUNT</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontFamily: '"Instrument Serif", serif', fontSize: 28, color: 'rgba(255,255,255,0.8)' }}>$</span>
              <span style={{
                fontFamily: '"Instrument Serif", serif', fontSize: 64, lineHeight: 1,
                color: '#fff', fontWeight: 400, letterSpacing: '-0.02em',
              }}>{amount}</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 8, fontFamily: 'JetBrains Mono, monospace' }}>
              Apr 15, 2026
            </div>
          </div>
        </Card>

        {/* Category chips */}
        <div style={{ marginBottom: 18 }}>
          <SectionLabel theme={theme}>Category</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {cats.map(c => {
              const active = category === c.key;
              const Ico = c.icon;
              return (
                <button key={c.key} onClick={() => setCategory(c.key)} style={{
                  background: active ? c.soft : theme.surface,
                  border: `1.5px solid ${active ? c.color : theme.border}`,
                  borderRadius: 16, padding: '14px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  transform: active ? 'translateY(-2px)' : 'translateY(0)',
                  boxShadow: active ? shadow(Math.max(2, tweaks.depth - 2)) : 'none',
                }}>
                  <Ico color={theme.ink} accent={c.color}/>
                  <div style={{ fontSize: 12, fontWeight: 600, color: active ? c.color : theme.ink2 }}>
                    {c.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subcategory chips */}
        <div style={{ marginBottom: 18 }}>
          <SectionLabel theme={theme}>Sub-category</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {subcats[category].map(s => {
              const active = subcat === s;
              return (
                <button key={s} onClick={() => setSubcat(s)} style={{
                  background: active ? selected.color : theme.surface,
                  color: active ? '#fff' : theme.ink2,
                  border: `1px solid ${active ? selected.color : theme.border}`,
                  borderRadius: 999, padding: '8px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 180ms ease',
                }}>{s}</button>
              );
            })}
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 18 }}>
          <SectionLabel theme={theme}>Note (optional)</SectionLabel>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Trader Joe's haul"
            style={inputStyle(theme)}/>
        </div>

        {/* Submit */}
        <button style={{
          ...primaryBtn(theme), width: '100%', padding: '16px 20px', fontSize: 15, marginTop: 8,
          background: selected.color,
        }}>
          Plant Expense
          <IconCheck size={16} color="#fff"/>
        </button>
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  3. ADD INCOME                                               ║
// ╚══════════════════════════════════════════════════════════════╝
function IncomeScreen({ theme, tweaks, onNavigate }) {
  const [amount, setAmount] = useState('5200');
  const [source, setSource] = useState('Paycheck');
  const sources = ['Paycheck', 'Side gig', 'Gift', 'Refund', 'Bonus', 'Other'];

  return (
    <div style={{ background: theme.bg, minHeight: '100%', paddingBottom: 120 }}>
      <ScreenHeader theme={theme} title="Log Income" subtitle="Every harvest counts" onBack={() => onNavigate('home')}/>

      <div style={{ padding: '0 20px' }}>
        <Card theme={theme} depth={tweaks.depth} padding={28} style={{
          background: `linear-gradient(140deg, ${theme.brand} 0%, ${theme.brand2} 130%)`,
          marginBottom: 20, textAlign: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -40, top: -40, width: 200, opacity: 0.13 }}>
            <path d="M100 20c-30 30-60 60-60 100s30 60 60 60 60-30 60-60-30-70-60-100z" fill="#fff"/>
          </svg>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.18em', fontWeight: 600, marginBottom: 6 }}>AMOUNT RECEIVED</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontFamily: '"Instrument Serif", serif', fontSize: 28, color: 'rgba(255,255,255,0.8)' }}>$</span>
              <span style={{ fontFamily: '"Instrument Serif", serif', fontSize: 72, lineHeight: 1, color: '#fff', letterSpacing: '-0.02em' }}>{amount}</span>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic', fontFamily: '"Instrument Serif", serif' }}>
              "Every good and perfect gift is from above" — James 1:17
            </div>
          </div>
        </Card>

        {/* 50/30/20 split preview */}
        <Card theme={theme} depth={tweaks.depth - 2} style={{ marginBottom: 20 }}>
          <SectionLabel theme={theme} style={{ marginBottom: 14, marginTop: 0 }}>How it splits</SectionLabel>
          <div style={{ display: 'flex', gap: 4, height: 12, borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ flex: 50, background: theme.needs }}/>
            <div style={{ flex: 30, background: theme.wants }}/>
            <div style={{ flex: 20, background: theme.goals }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {[
              { label: '50% Needs', amt: 2600, color: theme.needs },
              { label: '30% Wants', amt: 1560, color: theme.wants },
              { label: '20% Goals', amt: 1040, color: theme.goals },
            ].map(s => (
              <div key={s.label} style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }}/>
                  <span style={{ fontSize: 10, color: theme.ink3, fontWeight: 600, letterSpacing: '0.04em' }}>{s.label}</span>
                </div>
                <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 20, color: theme.ink, marginTop: 4 }}>
                  ${fmt$(s.amt)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ marginBottom: 18 }}>
          <SectionLabel theme={theme}>Source</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sources.map(s => {
              const active = source === s;
              return (
                <button key={s} onClick={() => setSource(s)} style={{
                  background: active ? theme.brand : theme.surface,
                  color: active ? '#fff' : theme.ink2,
                  border: `1px solid ${active ? theme.brand : theme.border}`,
                  borderRadius: 999, padding: '8px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>{s}</button>
              );
            })}
          </div>
        </div>

        <button style={{ ...primaryBtn(theme), width: '100%', padding: '16px 20px', fontSize: 15 }}>
          Add to Harvest <IconCheck size={16} color="#fff"/>
        </button>
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  4. PIGGY BANK / SAVINGS                                     ║
// ╚══════════════════════════════════════════════════════════════╝
function SavingsScreen({ theme, tweaks, onNavigate }) {
  const [tab, setTab] = useState('active');
  const [showForm, setShowForm] = useState(false);

  const balance = 1284.50;

  const goals = [
    { id: 1, title: 'Emergency fund', target: 3000, saved: 1850, monthsLeft: 4, weekly: 72, color: theme.goals },
    { id: 2, title: 'New laptop', target: 1400, saved: 980, monthsLeft: 2, weekly: 52, color: theme.brand2 },
    { id: 3, title: 'Wedding gift', target: 500, saved: 175, monthsLeft: 6, weekly: 14, color: theme.needs },
  ];

  const history = [
    { id: 1, name: 'Weekly transfer', day: 22, amt: 80, type: 'deposit' },
    { id: 2, name: 'Tax refund', day: 15, amt: 240, type: 'deposit' },
    { id: 3, name: 'Coffee maker', day: 8, amt: 95, type: 'withdrawal' },
    { id: 4, name: 'Side gig', day: 3, amt: 175, type: 'deposit' },
  ];

  return (
    <div style={{ background: theme.bg, minHeight: '100%', paddingBottom: 110 }}>
      <HeroBg brand={theme.brand} brand2={theme.brand2} style={{ paddingBottom: 50 }}>
        <div style={{ padding: '52px 22px 0', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <button onClick={() => onNavigate('home')} style={pillBtn(theme)}>
              <IconChevronLeft color="#fff" size={16}/>
            </button>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: '0.16em', fontWeight: 600 }}>SAVINGS</div>
            <CircleIconBtn><IconPlus color="#fff" size={18}/></CircleIconBtn>
          </div>

          {/* Big jar visual */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <SavingsJar fill={balance / 3000} size={92}/>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: '0.16em', fontWeight: 600 }}>
                YOUR PIGGY BANK
              </div>
              <Amount value={balance} color="#fff" size={48} animate={tweaks.animate}/>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>
                Little by little, it grows
              </div>
            </div>
          </div>

          {/* Action row */}
          <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button style={{
              background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.22)',
              color: '#fff', padding: '12px 14px', borderRadius: 14, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              backdropFilter: 'blur(10px)',
            }}>
              <IconPlus size={16} color="#fff"/> Set aside
            </button>
            <button style={{
              background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.18)',
              color: '#fff', padding: '12px 14px', borderRadius: 14, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              I bought it
            </button>
          </div>
        </div>
      </HeroBg>

      <div style={{ padding: '24px 18px 0' }}>
        {/* Tabs */}
        <div style={{
          background: theme.surfaceSoft, padding: 4, borderRadius: 14,
          display: 'flex', marginBottom: 18, border: `1px solid ${theme.borderSoft}`,
        }}>
          {['active', 'completed'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 12px',
              background: tab === t ? theme.surface : 'transparent',
              color: tab === t ? theme.ink : theme.ink3,
              border: 'none', borderRadius: 10,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: tab === t ? shadow(2) : 'none',
              transition: 'all 200ms ease', textTransform: 'capitalize',
            }}>{t} goals</button>
          ))}
        </div>

        {/* Goals */}
        <SectionLabel theme={theme}>Growing now</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {goals.map(g => {
            const pct = (g.saved / g.target) * 100;
            return (
              <Card key={g.id} theme={theme} depth={tweaks.depth} padding={16}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: theme.brandSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconTarget color={g.color} size={22}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{g.title}</div>
                    <div style={{ fontSize: 11, color: theme.ink3, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                      Save ${g.weekly}/week · {g.monthsLeft}mo left
                    </div>
                  </div>
                  <IconTrash size={14} color={theme.ink3}/>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontFamily: '"Instrument Serif", serif', fontSize: 26, color: theme.ink }}>
                    ${fmt$(g.saved)}
                  </span>
                  <span style={{ fontSize: 12, color: theme.ink3 }}>of ${fmt$(g.target)}</span>
                </div>
                <ProgressBar value={pct} color={g.color} bg={theme.borderSoft} animate={tweaks.animate}/>
              </Card>
            );
          })}
          <button onClick={() => setShowForm(!showForm)} style={{
            border: `1.5px dashed ${theme.border}`, background: 'transparent',
            color: theme.brand, padding: 14, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <IconPlus size={16} color={theme.brand}/> Plant a new goal
          </button>
        </div>

        <SectionLabel theme={theme} style={{ marginTop: 24 }}>Recent activity</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.map(h => (
            <Card key={h.id} theme={theme} depth={Math.max(2, tweaks.depth - 4)} padding={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: h.type === 'deposit' ? theme.brandSoft : theme.dangerSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconArrow dir={h.type === 'deposit' ? 'down' : 'up'} color={h.type === 'deposit' ? theme.brand : theme.danger}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: theme.ink }}>{h.name}</div>
                  <div style={{ fontSize: 11, color: theme.ink3, fontFamily: 'JetBrains Mono, monospace' }}>Apr {h.day}</div>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600,
                  color: h.type === 'deposit' ? theme.success : theme.danger }}>
                  {h.type === 'deposit' ? '+' : '−'}${fmt$(h.amt)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// Animated savings jar SVG
function SavingsJar({ fill = 0.5, size = 90 }) {
  const fillPct = Math.max(0.05, Math.min(1, fill));
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1}>
      <defs>
        <linearGradient id="jarFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#F4D35E"/>
          <stop offset="1" stopColor="#FDE68A"/>
        </linearGradient>
        <clipPath id="jarClip">
          <path d="M22 35h56l-5 65a4 4 0 0 1-4 4H31a4 4 0 0 1-4-4l-5-65z"/>
        </clipPath>
      </defs>
      {/* lid */}
      <rect x="25" y="20" width="50" height="14" rx="2" fill="rgba(255,255,255,0.85)"/>
      <rect x="28" y="22" width="44" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/>
      {/* jar */}
      <path d="M22 35h56l-5 65a4 4 0 0 1-4 4H31a4 4 0 0 1-4-4l-5-65z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.65)" strokeWidth="1.6"/>
      {/* fill */}
      <g clipPath="url(#jarClip)">
        <rect x="22" y={104 - 69 * fillPct} width="56" height={69 * fillPct} fill="url(#jarFill)"/>
        {/* coins */}
        <circle cx="38" cy={97 - 60 * fillPct} r="4" fill="rgba(255,255,255,0.4)"/>
        <circle cx="56" cy={102 - 64 * fillPct} r="3" fill="rgba(255,255,255,0.4)"/>
        <circle cx="68" cy={95 - 55 * fillPct} r="4.5" fill="rgba(255,255,255,0.5)"/>
      </g>
      {/* shine */}
      <path d="M28 42v50" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round"/>
      {/* sprout */}
      <path d="M50 20V8M50 14c0-3 2.5-5 5.5-5M50 12c0-3-2.5-5-5.5-5" stroke="#F4D35E" strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  5. LESSONS                                                  ║
// ╚══════════════════════════════════════════════════════════════╝
function LessonsScreen({ theme, tweaks, onNavigate }) {
  const [ratings, setRatings] = useState({ 1: 5, 2: 4 });
  const [active, setActive] = useState(null);

  const lessons = [
    { id: 1, title: 'The foolish steward', desc: 'Why hoarding without purpose leads to loss', verse: 'Luke 16:1-13', minutes: 6, done: true },
    { id: 2, title: 'Sowing in season', desc: 'When to spend, when to save — wisdom in timing', verse: 'Ecclesiastes 3:1', minutes: 8, done: true },
    { id: 3, title: 'The honest scale', desc: 'Integrity in transactions, big and small', verse: 'Proverbs 11:1', minutes: 5, done: false },
    { id: 4, title: 'First-fruits', desc: 'Why what you give first shapes what comes after', verse: 'Proverbs 3:9', minutes: 7, done: false },
    { id: 5, title: 'Debt as bondage', desc: 'Understanding the cost of borrowed comfort', verse: 'Proverbs 22:7', minutes: 9, done: false },
  ];

  return (
    <div style={{ background: theme.bg, minHeight: '100%', paddingBottom: 110 }}>
      <div style={{ padding: '60px 22px 8px' }}>
        <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 36, color: theme.ink, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
          Lessons<br/>from the field
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: theme.ink2, maxWidth: 280 }}>
          Scripture-rooted reflections on money, generosity, and stewardship.
        </div>

        {/* Progress strip */}
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <ProgressBar value={(2/5) * 100} color={theme.brand} bg={theme.borderSoft} height={6} animate={tweaks.animate}/>
            <div style={{ fontSize: 11, color: theme.ink3, marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
              2 of 5 lessons completed
            </div>
          </div>
          <div style={{
            background: theme.brandSoft, color: theme.brand,
            padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          }}>40%</div>
        </div>
      </div>

      <div style={{ padding: '20px 18px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lessons.map((l, i) => {
          const rating = ratings[l.id] ?? 0;
          return (
            <Card key={l.id} theme={theme} depth={tweaks.depth} padding={18}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 13,
                  background: l.done ? theme.brand : theme.surfaceSoft,
                  color: l.done ? '#fff' : theme.brand,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: '"Instrument Serif", serif',
                  fontSize: 22, fontWeight: 400,
                  border: l.done ? 'none' : `1.5px solid ${theme.brand}`,
                }}>{l.done ? <IconCheck color="#fff"/> : (i + 1).toString().padStart(2, '0')}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, letterSpacing: '-0.01em' }}>
                      {l.title}
                    </div>
                    <div style={{ fontSize: 11, color: theme.ink3, fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
                      {l.minutes} min
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: theme.ink2, marginTop: 4, lineHeight: 1.4 }}>{l.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: theme.surfaceSoft, padding: '4px 10px', borderRadius: 999,
                      fontSize: 11, color: theme.brand, fontWeight: 500,
                    }}>
                      <IconScripture size={12} color={theme.brand}/>
                      {l.verse}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1,2,3,4,5].map(s => (
                        <span key={s} onClick={() => setRatings({ ...ratings, [l.id]: s })} style={{ cursor: 'pointer' }}>
                          <IconStar size={16} color={s <= rating ? '#D4B254' : theme.border} filled={s <= rating}/>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────
function ScreenHeader({ theme, title, subtitle, onBack }) {
  return (
    <div style={{ padding: '54px 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <button onClick={onBack} style={{
          width: 38, height: 38, borderRadius: 12,
          background: theme.surface, border: `1px solid ${theme.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <IconChevronLeft color={theme.ink}/>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 26, color: theme.ink, lineHeight: 1, letterSpacing: '-0.02em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: theme.ink3, marginTop: 4, fontStyle: 'italic' }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, theme, style }) {
  return (
    <div style={{
      fontSize: 11, color: theme.ink3, letterSpacing: '0.16em', fontWeight: 600,
      marginBottom: 10, marginTop: 6,
      fontFamily: 'JetBrains Mono, monospace',
      textTransform: 'uppercase',
      ...style,
    }}>{children}</div>
  );
}

function CircleIconBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 38, height: 38, borderRadius: 999,
      background: 'rgba(255,255,255,0.16)',
      border: '1px solid rgba(255,255,255,0.22)',
      backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', position: 'relative',
    }}>{children}</button>
  );
}

function pillBtn(theme) {
  return {
    width: 38, height: 38, borderRadius: 12,
    background: 'rgba(255,255,255,0.16)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(10px)',
  };
}

function primaryBtn(theme) {
  return {
    background: theme.brand, color: '#fff',
    border: 'none', borderRadius: 14, padding: '14px 18px',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    boxShadow: `0 8px 20px ${theme.brand}40`,
    transition: 'transform 150ms ease',
  };
}

function secondaryBtn(theme) {
  return {
    background: theme.surface, color: theme.brand,
    border: `1px solid ${theme.border}`, borderRadius: 14, padding: '14px 18px',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  };
}

function inputStyle(theme) {
  return {
    width: '100%', boxSizing: 'border-box',
    background: theme.surface, border: `1px solid ${theme.border}`,
    borderRadius: 12, padding: '14px 16px',
    fontSize: 14, color: theme.ink,
    fontFamily: 'inherit',
    outline: 'none',
  };
}

Object.assign(window, {
  getTheme, shadow, DashboardScreen, ExpenseScreen, IncomeScreen, SavingsScreen, LessonsScreen,
  useTicker, fmt$, Amount, ProgressBar, Card,
});
