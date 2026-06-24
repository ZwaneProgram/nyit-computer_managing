import { useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from './components/Icons';
import { NAV, Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { MobileNav } from './components/MobileNav';
import { DashboardView } from './views/DashboardView';
import { InventoryView } from './views/InventoryView';
import { AddProductView } from './views/AddProductView';
import { CategoriesView } from './views/CategoriesView';
import { BundlesView } from './views/BundlesView';
import { SalesView } from './views/SalesView';
import { AnalyticsView } from './views/AnalyticsView';
import { GeneratePostView } from './views/GeneratePostView';
import { GenerateBarcodeView } from './views/GenerateBarcodeView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { useTheme } from './hooks/useTheme';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useAuth } from './auth/AuthContext';
import type { ViewId } from './types';

export default function App() {
  const [view, setView] = useState<ViewId>('dashboard');
  const [toast, setToast] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<number | null>(null);
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

  // Navigating closes the mobile drawer. Reaching the product form via normal
  // nav means "create" — so clear any pending edit target.
  const navigate = useCallback((id: ViewId) => {
    if (id === 'add-product') setEditProductId(null);
    setView(id);
    setDrawerOpen(false);
  }, []);

  // Open the product form in edit mode for a specific product.
  const editProduct = useCallback((id: number) => {
    setEditProductId(id);
    setView('add-product');
    setDrawerOpen(false);
  }, []);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const cur =
    NAV.find((n) => n.id === view) ??
    (view === 'settings'
      ? { titleTH: 'ตั้งค่าระบบ', crumb: 'ระบบ / ตั้งค่า' }
      : NAV[0]);

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <DashboardView onNav={navigate} />;
      case 'inventory': return <InventoryView onNav={navigate} showToast={showToast} onEditProduct={editProduct} />;
      case 'add-product': return <AddProductView onNav={navigate} showToast={showToast} editId={editProductId} />;
      case 'categories': return <CategoriesView showToast={showToast} />;
      case 'bundles': return <BundlesView showToast={showToast} />;
      case 'sales': return <SalesView showToast={showToast} />;
      case 'analytics': return <AnalyticsView />;
      case 'generate-post': return <GeneratePostView showToast={showToast} />;
      case 'generate-barcode': return <GenerateBarcodeView showToast={showToast} />;
      case 'settings': return <SettingsView showToast={showToast} />;
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
