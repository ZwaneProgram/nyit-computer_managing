import { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';
import {
  ACCENT_MAP,
  ACCENT_SWATCHES,
  type Density,
  type ThemeState,
} from '../hooks/useTheme';

interface SettingsMenuProps {
  theme: ThemeState;
  onSet: <K extends keyof ThemeState>(key: K, value: ThemeState[K]) => void;
}

const DENSITIES: { value: Density; label: string }[] = [
  { value: 'compact', label: 'แน่น' },
  { value: 'regular', label: 'ปกติ' },
  { value: 'comfy', label: 'สบาย' },
];

/** Topbar popover mirroring the design's Tweaks: accent color + row density. */
export function SettingsMenu({ theme, onSet }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const densityIdx = Math.max(0, DENSITIES.findIndex((d) => d.value === theme.density));

  return (
    <div className="popover-host" ref={ref}>
      <button
        className="btn btn-icon btn-ghost"
        title="ปรับแต่งหน้าตา"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icons.settings />
      </button>
      {open && (
        <div className="popover" role="menu">
          <div className="popover-section">สีหลัก</div>
          <div className="swatch-row">
            {ACCENT_SWATCHES.map((hex) => (
              <button
                key={hex}
                className="swatch"
                data-active={theme.accent === hex}
                style={{ background: ACCENT_MAP[hex] }}
                title={hex}
                onClick={() => onSet('accent', hex)}
              >
                {theme.accent === hex && <Icons.check style={{ width: 13, height: 13 }} />}
              </button>
            ))}
          </div>

          <div className="popover-section">ความหนาแน่นของแถว</div>
          <input
            type="range"
            min={0}
            max={DENSITIES.length - 1}
            step={1}
            value={densityIdx}
            onChange={(e) => onSet('density', DENSITIES[Number(e.target.value)].value)}
            className="density-slider"
            aria-label="ความหนาแน่นของแถว"
            style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {DENSITIES.map((d, i) => (
              <span
                key={d.value}
                style={{
                  fontSize: 11,
                  color: i === densityIdx ? 'var(--ink)' : 'var(--ink-3)',
                  fontWeight: i === densityIdx ? 600 : 400,
                }}
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
