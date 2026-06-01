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
          <div className="seg">
            {DENSITIES.map((d) => (
              <button
                key={d.value}
                className="seg-btn"
                data-active={theme.density === d.value}
                onClick={() => onSet('density', d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
