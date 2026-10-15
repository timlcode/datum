import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { ACCENTS, THEMES, applyAppearance, readAppearance, writeAppearance, type AccentName, type Appearance, type ThemeName } from '../appearance';

export function AppearanceControls() {
  const [prefs, setPrefs] = useState<Appearance>(() => readAppearance());

  const update = (patch: Partial<Appearance>) => {
    setPrefs(writeAppearance({ ...prefs, ...patch }));
  };

  return (
    <div className="appearance">
      <div className="theme-seg" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={prefs.theme === t.id} className={prefs.theme === t.id ? 'active' : ''} onClick={() => update({ theme: t.id as ThemeName })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="accent-row" role="radiogroup" aria-label="Accent">
        {ACCENTS.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={prefs.accent === c.id} className={`swatch ${c.id} ${prefs.accent === c.id ? 'on' : ''}`} onClick={() => update({ accent: c.id as AccentName })}>
            <i />
            {c.label}
          </button>
        ))}
      </div>
      <label className="motion-toggle">
        <input type="checkbox" checked={prefs.motion} onChange={(e) => update({ motion: e.target.checked })} />
        <span>Glow and motion</span>
      </label>
      <p className="hint">{THEMES.find((t) => t.id === prefs.theme)?.hint} Motion follows this switch, and also backs off when the system asks for less.</p>
    </div>
  );
}

export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyAppearance();
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="appearance-anchor" ref={ref}>
      <button className={`btn ghost ${open ? 'primary' : ''}`} onClick={() => setOpen((v) => !v)} title="Theme, accent, and motion" aria-expanded={open}>
        <Palette /> <span className="lbl">Theme</span>
      </button>
      {open && (
        <div className="appearance-pop">
          <div className="pop-title">Appearance</div>
          <AppearanceControls />
        </div>
      )}
    </div>
  );
}
