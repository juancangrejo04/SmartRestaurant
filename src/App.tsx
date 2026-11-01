import React, { useState } from 'react';
import { I18nProvider, useI18n } from './i18n/i18nContext';
import { Header } from './components/Header';
import { LoginModal } from './components/LoginModal';
import { DashboardView } from './components/DashboardView';
import { ReservationView } from './components/ReservationView';
import { QrOrderView } from './components/QrOrderView';
import { KitchenDisplayView } from './components/KitchenDisplayView';
import { MenuManagementView } from './components/MenuManagementView';
import { ReportsView } from './components/ReportsView';
import { DistributedInspectorView } from './components/DistributedInspectorView';
import { WaiterView } from './components/WaiterView';
import { CustomerOrdersView } from './components/CustomerOrdersView';
import { ReviewsView } from './components/ReviewsView';
import { UserRole } from './types';
import { store } from './domain/store';

const MainApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState(() => store.getCurrentUser());
  const [currentRole, setCurrentRole] = useState<UserRole>(() => store.getCurrentUser().role);
  const [activeTab, setActiveTab] = useState<string>(() =>
    store.getCurrentUser().role === 'CUSTOMER' ? 'qrOrder' : 'dashboard'
  );
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const { t, marketConfig } = useI18n();
  const activeBranch = store.getActiveBranch();
  const activeTenant = store.getActiveTenant();

  const handleLoginSuccess = (role: UserRole) => {
    setCurrentUser(store.getCurrentUser());
    setCurrentRole(role);

    // Navigate to default authorized view for the role
    if (role === 'KITCHEN') {
      setActiveTab('kitchen');
    } else if (role === 'WAITER') {
      setActiveTab('waiterTables');
    } else if (role === 'ADMIN' || role === 'OWNER') {
      setActiveTab('dashboard');
    } else {
      setActiveTab('qrOrder');
    }
  };

  const handleLogout = () => {
    store.logoutStaff();
    setCurrentUser(store.getCurrentUser());
    setCurrentRole('CUSTOMER');
    setActiveTab('qrOrder');
  };

  // Render view strictly enforcing role boundaries
  const renderRoleView = () => {
    // 1. CUSTOMER: strictly isolated to dining, booking, order tracking, and reviews
    if (currentRole === 'CUSTOMER') {
      if (activeTab === 'reservations') return <ReservationView />;
      if (activeTab === 'myOrders') return (
        <CustomerOrdersView
          onNavigateToMenu={() => setActiveTab('qrOrder')}
          onNavigateToReviews={() => setActiveTab('reviews')}
        />
      );
      if (activeTab === 'reviews') return <ReviewsView />;
      return <QrOrderView onNavigateToReviews={() => setActiveTab('reviews')} />;
    }

    // 2. KITCHEN: strictly isolated to KDS ticket display
    if (currentRole === 'KITCHEN') {
      return <KitchenDisplayView />;
    }

    // 3. WAITER: tables, orders and reservations
    if (currentRole === 'WAITER') {
      if (activeTab === 'kitchen') return <KitchenDisplayView />;
      if (activeTab === 'reservations') return <ReservationView />;
      return <WaiterView />;
    }

    // 4. ADMIN: operations dashboard, reservations, kitchen, menu, reports, reviews
    if (currentRole === 'ADMIN') {
      if (activeTab === 'reservations') return <ReservationView />;
      if (activeTab === 'kitchen') return <KitchenDisplayView />;
      if (activeTab === 'menuManagement') return <MenuManagementView />;
      if (activeTab === 'reports') return <ReportsView />;
      if (activeTab === 'reviews') return <ReviewsView />;
      return <DashboardView onNavigate={setActiveTab} />;
    }

    // 5. OWNER: operations dashboard, reservations, kitchen, menu, reports, reviews, and architecture audit
    if (activeTab === 'reservations') return <ReservationView />;
    if (activeTab === 'kitchen') return <KitchenDisplayView />;
    if (activeTab === 'menuManagement') return <MenuManagementView />;
    if (activeTab === 'reports') return <ReportsView />;
    if (activeTab === 'reviews') return <ReviewsView />;
    if (activeTab === 'architecture') return <DistributedInspectorView />;
    return <DashboardView onNavigate={setActiveTab} />;
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentUserRole={currentRole}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderRoleView()}
      </main>

      {/* Staff Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Footer */}
      <footer className="bg-stone-900 border-t border-stone-800 text-xs text-stone-400 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white tracking-tight">{activeTenant.name}</span>
            <span>· {activeBranch.name}</span>
            <span className="text-stone-600">|</span>
            <span className="text-amber-400 font-mono">
              Moneda: {activeBranch.commercialCurrency}
            </span>
          </div>

          <div className="flex items-center space-x-4 text-[11px] text-stone-400">
            {currentRole === 'CUSTOMER' ? (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="hover:text-amber-400 transition-colors"
              >
                Acceso Personal / Staff Login
              </button>
            ) : (
              <span>Sesión activa: <strong className="text-stone-200">{currentUser.name} ({currentRole})</strong></span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <I18nProvider>
      <MainApp />
    </I18nProvider>
  );
}
