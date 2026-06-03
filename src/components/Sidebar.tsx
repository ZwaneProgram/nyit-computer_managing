import { Icons, type IconName } from './Icons';
import { PRODUCTS } from '../data/catalog';
import type { ViewId } from '../types';
import type { ApiUser } from '../lib/api';

interface NavItem {
  id: ViewId;
  label: string;
  icon: IconName;
  group: 'main' | 'sell';
}

export const NAV: {
  id: ViewId;
  label: string;
  icon: IconName;
  group: 'main' | 'sell';
  titleTH: string;
  crumb: string;
}[] = [
  { id: 'dashboard', label: 'แดชบอร์ด', icon: 'dashboard', group: 'main', titleTH: 'แดชบอร์ด', crumb: 'หน้าหลัก / แดชบอร์ด' },
  { id: 'inventory', label: 'คลังสินค้า', icon: 'box', group: 'main', titleTH: 'คลังสินค้า', crumb: 'สินค้า / คลังสินค้า' },
  { id: 'add-product', label: 'เพิ่มสินค้า', icon: 'plus', group: 'main', titleTH: 'เพิ่มสินค้า', crumb: 'สินค้า / เพิ่มใหม่' },
  { id: 'categories', label: 'หมวดหมู่', icon: 'tag', group: 'main', titleTH: 'จัดการหมวดหมู่', crumb: 'สินค้า / หมวดหมู่' },
  { id: 'bundles', label: 'ชุดสินค้า', icon: 'layers', group: 'main', titleTH: 'ชุดสินค้า (Bundles)', crumb: 'สินค้า / ชุดสินค้า' },
  { id: 'sales', label: 'ขายสินค้า', icon: 'cart', group: 'sell', titleTH: 'ระบบขาย', crumb: 'การขาย / ขายสินค้า' },
  { id: 'analytics', label: 'วิเคราะห์', icon: 'chart', group: 'sell', titleTH: 'วิเคราะห์และรายงาน', crumb: 'รายงาน / วิเคราะห์' },
];

interface SidebarProps {
  active: ViewId;
  onNav: (id: ViewId) => void;
  user: ApiUser;
  /** Mobile drawer open state. */
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ active, onNav, user, open = false, onClose }: SidebarProps) {
  const lowCount = PRODUCTS.filter((p) => p.stock <= p.low).length;
  const displayName = user.full_name || user.username;
  const initials = displayName.trim().slice(0, 2);
  const groups: { key: NavItem['group']; label: string }[] = [
    { key: 'main', label: 'ภาพรวม' },
    { key: 'sell', label: 'การขาย' },
  ];

  return (
    <>
      {open && <div className="sb-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className="sb" data-open={open}>
        <div className="sb-brand">
          <div className="sb-logo">N</div>
          <div>
            <div className="sb-brand-name">Nyit Computer</div>
            <div className="sb-brand-sub">ระบบจัดการสต๊อก</div>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.key}>
            <div className="sb-section">{g.label}</div>
            {NAV.filter((n) => n.group === g.key).map((n) => {
              const Ic = Icons[n.icon];
              return (
                <button
                  key={n.id}
                  className="sb-item"
                  data-active={active === n.id}
                  onClick={() => onNav(n.id)}
                >
                  <Ic className="sb-item-icon" />
                  <span>{n.label}</span>
                  {n.id === 'inventory' && lowCount > 0 && (
                    <span className="sb-badge">{lowCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        <div className="sb-section">ตั้งค่า</div>
        <button className="sb-item">
          <Icons.settings className="sb-item-icon" />
          <span>ตั้งค่าระบบ</span>
        </button>

        <div className="sb-user">
          <div className="sb-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>@{user.username}</div>
          </div>
        </div>
      </aside>
    </>
  );
}
