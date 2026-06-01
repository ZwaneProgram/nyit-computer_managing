import { Icons, type IconName } from './Icons';
import type { ViewId } from '../types';

const ITEMS: { id: ViewId; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'หน้าหลัก', icon: 'dashboard' },
  { id: 'inventory', label: 'คลัง', icon: 'box' },
  { id: 'sales', label: 'ขาย', icon: 'cart' },
  { id: 'bundles', label: 'ชุด', icon: 'layers' },
  { id: 'analytics', label: 'รายงาน', icon: 'chart' },
];

interface MobileNavProps {
  active: ViewId;
  onNav: (id: ViewId) => void;
}

export function MobileNav({ active, onNav }: MobileNavProps) {
  return (
    <nav className="mobile-nav">
      {ITEMS.map((n) => {
        const Ic = Icons[n.icon];
        return (
          <button
            key={n.id}
            className="mn-btn"
            data-active={active === n.id}
            onClick={() => onNav(n.id)}
          >
            <Ic />
            <span>{n.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
