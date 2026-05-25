// DollarSeeds — App shell + tab bar + tweaks

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "forest",
  "depth": 7,
  "animate": true,
  "dark": false,
  "scriptureBanner": true
}/*EDITMODE-END*/;

const TABS = [
  { key: 'home',    label: 'Home',     Icon: IconHome },
  { key: 'expense', label: 'Expense',  Icon: IconExpense },
  { key: 'income',  label: 'Income',   Icon: IconIncome },
  { key: 'savings', label: 'Savings',  Icon: IconSavings },
  { key: 'lessons', label: 'Lessons',  Icon: IconLessons },
];

function TabBar({ active, onChange, theme, tweaks }) {
  return (
    <div style={{
      position: 'absolute',
      left: 12, right: 12, bottom: 14, zIndex: 30,
      background: theme.surface,
      borderRadius: 24,
      padding: '8px 6px',
      display: 'flex',
      boxShadow: shadow(Math.max(6, tweaks.depth)),
      border: `1px solid ${theme.borderSoft}`,
    }}>
      {TABS.map(t => {
        const isActive = t.key === active;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '6px 0', borderRadius: 16,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            position: 'relative',
            transition: 'all 200ms ease',
          }}>
            <div style={{
              padding: '4px 12px', borderRadius: 999,
              background: isActive ? theme.brand : 'transparent',
              transition: 'all 240ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}>
              <t.Icon color={isActive ? '#fff' : theme.ink3} accent={isActive ? '#fff' : theme.brand} size={20} filled={isActive}/>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: isActive ? theme.brand : theme.ink3,
              letterSpacing: '0.02em',
              opacity: isActive ? 1 : 0.7,
            }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const tweaks = { ...t, setTweak };

  const theme = getTheme(t);
  const [tab, setTab] = useState('home');
  const [transitionKey, setTransitionKey] = useState(0);

  const handleNavigate = (next) => {
    setTab(next);
    setTransitionKey(k => k + 1);
  };

  // Programmatic hooks for screenshot capture
  useEffect(() => {
    window.__setTweak = setTweak;
    window.__navigate = handleNavigate;
  });

  const screen = (() => {
    const props = { theme, tweaks, onNavigate: handleNavigate };
    switch (tab) {
      case 'home':    return <DashboardScreen {...props}/>;
      case 'expense': return <ExpenseScreen {...props}/>;
      case 'income':  return <IncomeScreen {...props}/>;
      case 'savings': return <SavingsScreen {...props}/>;
      case 'lessons': return <LessonsScreen {...props}/>;
      default:        return <DashboardScreen {...props}/>;
    }
  })();

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      background: t.dark ? '#0A1612' : '#EAE3D2',
      backgroundImage: t.dark
        ? 'radial-gradient(ellipse at top, #0F2820 0%, #0A1612 60%)'
        : 'radial-gradient(ellipse at top, #F5F1E6 0%, #E3DAC0 100%)',
      padding: '40px 0 80px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: '"Geist", -apple-system, system-ui, sans-serif',
    }}>
      {t.__bare ? (
        <div style={{
          width: 390, height: 'auto', minHeight: 844,
          background: t.dark ? '#13231C' : '#FFFFFF',
          borderRadius: 36, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(15,40,32,0.15), 0 0 0 1px rgba(15,40,32,0.08)',
          position: 'relative',
        }}>
          <div style={{ height: 44 }}/>
          <div style={{ position: 'relative', minHeight: 800 }}>
            {screen}
            <TabBar active={tab} onChange={handleNavigate} theme={theme} tweaks={tweaks}/>
          </div>
        </div>
      ) : (
        <IOSDevice width={390} height={844} dark={t.dark}>
          <div style={{ position: 'relative', minHeight: '100%', height: '100%' }}>
            <div key={transitionKey} style={{
              animation: t.animate ? 'screenIn 360ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
              minHeight: '100%',
            }}>{screen}</div>
            <TabBar active={tab} onChange={handleNavigate} theme={theme} tweaks={tweaks}/>
          </div>
        </IOSDevice>
      )}

      <TweaksPanel title="DollarSeeds Tweaks">
        <TweakSection label="Brand"/>
        <TweakSelect label="Palette" value={t.palette}
          options={['forest','sage','indigo','plum']}
          onChange={v => setTweak('palette', v)}/>
        <TweakToggle label="Dark mode" value={t.dark} onChange={v => setTweak('dark', v)}/>

        <TweakSection label="Surface & motion"/>
        <TweakSlider label="Card depth" min={0} max={10} step={1}
          value={t.depth} onChange={v => setTweak('depth', v)}/>
        <TweakToggle label="Animations" value={t.animate} onChange={v => setTweak('animate', v)}/>
        <TweakToggle label="Scripture banner" value={t.scriptureBanner}
          onChange={v => setTweak('scriptureBanner', v)}/>

        <TweakSection label="Jump to screen"/>
        <TweakSelect label="Screen" value={tab}
          options={TABS.map(x => x.key)}
          onChange={v => handleNavigate(v)}/>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
