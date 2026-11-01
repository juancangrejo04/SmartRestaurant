import React, { useState } from 'react';
import { useI18n, MARKETS } from '../i18n/i18nContext';
import { MarketCode, UserRole } from '../types';
import { store } from '../domain/store';
import {
  UtensilsCrossed,
  Globe,
  Lock,
  LogOut,
  ChevronDown,
  User,
  ChefHat,
  Crown,
  Briefcase,
  QrCode,
  CalendarDays,
  LayoutGrid,
  FileText,
  Clock,
  Sparkles,
  Store,
  Star,
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  currentUserRole: UserRole;
  onOpenLoginModal: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  currentUserRole,
  onOpenLoginModal,
  onLogout,
}) => {
  const { currentMarket, setMarket, marketConfig, t } = useI18n();
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  const restaurants = store.getRestaurants();
  const activeTenant = store.getActiveTenant();
  const activeBranch = store.getActiveBranch();
  const currentUser = store.getCurrentUser();
  const isStaff = store.isStaffAuthenticated();

  // Handle country/restaurant switch: automatically updates tenant, 2 branches, currency, and language!
  const handleSelectCountryAndBranch = (tenantId: string, branchId: string) => {
    store.setActiveTenant(tenantId);
    store.setActiveBranch(branchId);

    // Automatically synchronize language & currency according to the country!
    const targetMarket = store.getMarketForTenant(tenantId);
    setMarket(targetMarket);
    setShowCountryDropdown(false);
  };

  // Determine authorized navigation tabs according to the user's role
  const getTabsForRole = () => {
    if (currentUserRole === 'CUSTOMER') {
      return [
        { id: 'qrOrder', label: t.nav.qrOrder, icon: <QrCode className="w-4 h-4" /> },
        { id: 'reservations', label: t.nav.reservations, icon: <CalendarDays className="w-4 h-4" /> },
        { id: 'myOrders', label: t.nav.myOrders, icon: <Clock className="w-4 h-4" /> },
        { id: 'reviews', label: t.nav.reviews, icon: <Star className="w-4 h-4" /> },
      ];
    }

    if (currentUserRole === 'KITCHEN') {
      return [
        { id: 'kitchen', label: t.nav.kitchen, icon: <ChefHat className="w-4 h-4" /> },
      ];
    }

    if (currentUserRole === 'WAITER') {
      return [
        { id: 'waiterTables', label: t.nav.waiterTables, icon: <LayoutGrid className="w-4 h-4" /> },
        { id: 'kitchen', label: t.nav.kitchen, icon: <Clock className="w-4 h-4" /> },
        { id: 'reservations', label: t.nav.reservations, icon: <CalendarDays className="w-4 h-4" /> },
      ];
    }

    if (currentUserRole === 'ADMIN') {
      return [
        { id: 'dashboard', label: t.nav.dashboard, icon: <LayoutGrid className="w-4 h-4" /> },
        { id: 'reservations', label: t.nav.reservations, icon: <CalendarDays className="w-4 h-4" /> },
        { id: 'kitchen', label: t.nav.kitchen, icon: <ChefHat className="w-4 h-4" /> },
        { id: 'menuManagement', label: t.nav.menuAndTables, icon: <UtensilsCrossed className="w-4 h-4" /> },
        { id: 'reports', label: t.nav.reports, icon: <FileText className="w-4 h-4" /> },
        { id: 'reviews', label: t.nav.reviews, icon: <Star className="w-4 h-4" /> },
      ];
    }

    // OWNER: Full Access without redundant customer order placing
    return [
      { id: 'dashboard', label: t.nav.dashboard, icon: <LayoutGrid className="w-4 h-4" /> },
      { id: 'reservations', label: t.nav.reservations, icon: <CalendarDays className="w-4 h-4" /> },
      { id: 'kitchen', label: t.nav.kitchen, icon: <ChefHat className="w-4 h-4" /> },
      { id: 'menuManagement', label: t.nav.menuAndTables, icon: <UtensilsCrossed className="w-4 h-4" /> },
      { id: 'reports', label: t.nav.reports, icon: <FileText className="w-4 h-4" /> },
      { id: 'reviews', label: t.nav.reviews, icon: <Star className="w-4 h-4" /> },
      { id: 'architecture', label: t.nav.architecture, icon: <Sparkles className="w-4 h-4" /> },
    ];
  };

  const navTabs = getTabsForRole();

  // Helper for role icon & color
  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'OWNER':
        return { label: t.roles.owner, color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: <Crown className="w-3.5 h-3.5" /> };
      case 'ADMIN':
        return { label: t.roles.admin, color: 'bg-sky-500/20 text-sky-300 border-sky-500/30', icon: <Briefcase className="w-3.5 h-3.5" /> };
      case 'WAITER':
        return { label: t.roles.waiter, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: <User className="w-3.5 h-3.5" /> };
      case 'KITCHEN':
        return { label: t.roles.kitchen, color: 'bg-rose-500/20 text-rose-300 border-rose-500/30', icon: <ChefHat className="w-3.5 h-3.5" /> };
      default:
        return null;
    }
  };

  const roleBadge = getRoleBadge(currentUserRole);

  return (
    <header className="sticky top-0 z-40 bg-stone-900 border-b border-stone-800 text-stone-100 shadow-lg">
      {/* Top Bar: Country Selector & Location */}
      <div className="bg-stone-950 px-4 sm:px-6 lg:px-8 py-2 text-xs text-stone-400 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Store className="w-3.5 h-3.5 text-amber-500" />
          <span className="font-medium text-stone-300">{activeTenant.name}</span>
          <span className="text-stone-600">·</span>
          <span className="text-amber-400 font-semibold">{activeBranch.name}</span>
        </div>

        {/* Country & Branch Selector: automatically pairs country, language & currency! */}
        <div className="relative">
          <button
            onClick={() => setShowCountryDropdown(!showCountryDropdown)}
            className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs text-stone-200 transition-colors"
          >
            <span className="text-sm">{marketConfig.flag}</span>
            <span className="font-medium">{marketConfig.country}</span>
            <span className="font-mono text-[10px] text-amber-400 font-bold bg-stone-950 px-1 py-0.5 rounded">
              {activeBranch.commercialCurrency}
            </span>
            <ChevronDown className="w-3 h-3 text-stone-400" />
          </button>

          {showCountryDropdown && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-stone-900 border border-stone-700 shadow-2xl py-2 z-50">
              <div className="px-3.5 py-2 text-[11px] font-bold text-stone-400 uppercase tracking-wider border-b border-stone-800">
                {t.nav.selectCountryAndBranch}
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-stone-800">
                {restaurants.map((rest) => {
                  const market = store.getMarketForTenant(rest.id);
                  const mConfig = MARKETS[market];

                  return (
                    <div key={rest.id} className="p-2">
                      <div className="px-2 py-1 text-xs font-bold text-white flex items-center space-x-2">
                        <span>{mConfig.flag}</span>
                        <span>{mConfig.country}</span>
                        <span className="text-[10px] text-amber-400 font-mono">({rest.branches[0]?.commercialCurrency})</span>
                      </div>
                      <div className="space-y-1 mt-1">
                        {rest.branches.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => handleSelectCountryAndBranch(rest.id, b.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                              activeBranch.id === b.id
                                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                                : 'text-stone-300 hover:bg-stone-800'
                            }`}
                          >
                            <span>{b.name}</span>
                            <span className="text-[10px] text-stone-400">{b.city}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Bar: Restaurant Logo, Logged In Staff Badge (Hidden for Customer), Login/Logout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        {/* Restaurant Identity */}
        <div
          onClick={() => onSelectTab(currentUserRole === 'CUSTOMER' ? 'qrOrder' : 'dashboard')}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center text-stone-950 font-bold shadow-md group-hover:scale-105 transition-transform">
            <UtensilsCrossed className="w-5 h-5 text-stone-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight text-white">SmartRestaurant</span>
            </div>
            <p className="text-xs text-stone-400 font-medium">
              {currentUserRole === 'CUSTOMER' ? 'Atención a Mesa & Reservas' : 'Sistema de Operaciones'}
            </p>
          </div>
        </div>

        {/* Right Section: Role Visibility */}
        <div className="flex items-center space-x-3">
          {/* Requirement 6: "todos los roles menos el cliente, pueden ver qué rol esta loggeado" */}
          {isStaff && roleBadge ? (
            <div className="flex items-center space-x-3 bg-stone-950/80 border border-stone-800 px-3 py-1.5 rounded-2xl">
              {currentUser.avatarUrl && (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-7 h-7 rounded-full object-cover border border-amber-500/40"
                />
              )}
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-white">{currentUser.name}</div>
                <div className="flex items-center space-x-1">
                  <span
                    className={`inline-flex items-center space-x-1 text-[10px] font-bold px-1.5 py-0.2 rounded border ${roleBadge.color}`}
                  >
                    {roleBadge.icon}
                    <span>{roleBadge.label}</span>
                  </span>
                </div>
              </div>

              {/* Log out button */}
              <button
                onClick={onLogout}
                className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-rose-400 transition-colors"
                title={t.nav.logout}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* For CUSTOMER: Never show staff badge. Show clear staff login button */
            <button
              onClick={onOpenLoginModal}
              className="px-3.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700/80 border border-stone-700 text-xs font-semibold text-stone-300 hover:text-white transition-all flex items-center space-x-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.nav.staffLogin}</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs (Filtered strictly by role!) */}
      <div className="bg-stone-950/90 border-t border-stone-800 px-4 sm:px-6 lg:px-8 overflow-x-auto scrollbar-none">
        <nav className="flex space-x-1.5 py-2 min-w-max">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-500/10'
                  : 'text-stone-300 hover:bg-stone-800/80 hover:text-white'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
