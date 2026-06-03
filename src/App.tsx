import { useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from './components/Icons';
import { NAV, Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { MobileNav } from './components/MobileNav';
import { DashboardView } from './views/DashboardView';
import { InventoryView } from './views/InventoryView';
import { AddProductView } from './views/AddProductView';
import { BundlesView } from './views/BundlesView';
import { SalesView } from './views/SalesView';
import { AnalyticsView } from './views/AnalyticsView';
import { LoginView } from './views/LoginView';
import { useTheme } from './hooks/useTheme';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useAuth } from './auth/AuthContext';
import type { ViewId } from './types';

export default function App() {
  const [view, setView] = useState<ViewId>('dashboard');
  const [toast, setToast] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, set } = useTheme();
  const { user, loading, logout } = useAuth();
  const isMobile = useMediaQuery('(max-width: 900px)');
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Navigating closes the mobile drawer and scrolls the content back to top.
  const navigate = useCallback((id: ViewId) => {
    setView(id);
    setDrawerOpen(false);
  }, []);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const cur = NAV.find((n) => n.id === view) ?? NAV[0];

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <DashboardView onNav={navigate} />;
      case 'inventory': return <InventoryView onNav={navigate} />;
      case 'add-product': return <AddProductView onNav={navigate} showToast={showToast} />;
      case 'bundles': return <BundlesView showToast={showToast} />;
      case 'sales': return <SalesView showToast={showToast} />;
      case 'analytics': return <AnalyticsView />;
      default: return null;
    }
  };

  // Auth gate: block the app until we know who (if anyone) is logged in.
  if (loading) {
    return (
      <div className="auth">
        <div className="auth-loading">กำลังโหลด...</div>
      </div>
    );
  }
  if (!user) return <LoginView />;

  return (
    <div className="app">
      <Sidebar
        active={view}
        onNav={navigate}
        user={user}
        open={isMobile && drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="main">
        <Topbar
          title={cur.titleTH}
          crumb={cur.crumb}
          theme={theme}
          onSet={set}
          user={user}
          onLogout={logout}
          onMenu={() => setDrawerOpen(true)}
        />
        <main className="content">{renderView()}</main>
        <MobileNav active={view} onNav={navigate} />
      </div>

      {toast && (
        <div className="toast" role="status">
          <Icons.check style={{ color: 'oklch(0.7 0.15 155)' }} />
          {toast}
        </div>
      )}
    </div>
  );
}
