import { Icons } from './Icons';
import { SettingsMenu } from './SettingsMenu';
import type { ThemeState } from '../hooks/useTheme';
import type { ApiUser } from '../lib/api';

interface TopbarProps {
  title: string;
  crumb: string;
  theme: ThemeState;
  onSet: <K extends keyof ThemeState>(key: K, value: ThemeState[K]) => void;
  user: ApiUser;
  onLogout: () => void;
  /** Opens the mobile sidebar drawer; only shown on small screens. */
  onMenu: () => void;
}

export function Topbar({ title, crumb, theme, onSet, user, onLogout, onMenu }: TopbarProps) {
  return (
    <header className="topbar">
      <button className="btn btn-icon btn-ghost topbar-menu" onClick={onMenu} title="เมนู" aria-label="เปิดเมนู">
        <Icons.menu />
      </button>
      <div className="topbar-titles">
        <div className="topbar-title">{title}</div>
        <div className="topbar-crumb">{crumb}</div>
      </div>
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        <div className="search topbar-search">
          <Icons.search />
          <input placeholder="ค้นหาทั่วทั้งระบบ..." aria-label="ค้นหา" />
          <kbd>⌘K</kbd>
        </div>
        <button className="btn btn-icon btn-ghost topbar-search-btn" title="ค้นหา" aria-label="ค้นหา">
          <Icons.search />
        </button>
        <button
          className="btn btn-icon btn-ghost"
          onClick={() => onSet('dark', !theme.dark)}
          title={theme.dark ? 'โหมดสว่าง' : 'โหมดมืด'}
          aria-label="สลับธีม"
        >
          {theme.dark ? <Icons.sun /> : <Icons.moon />}
        </button>
        <SettingsMenu theme={theme} onSet={onSet} />
        <button className="btn btn-icon btn-ghost notif-btn" title="การแจ้งเตือน" aria-label="การแจ้งเตือน">
          <Icons.bell />
          <span className="notif-dot" />
        </button>
        <button
          className="btn btn-icon btn-ghost"
          onClick={onLogout}
          title={`ออกจากระบบ (${user.full_name || user.username})`}
          aria-label="ออกจากระบบ"
        >
          <Icons.logout />
        </button>
      </div>
    </header>
  );
}
