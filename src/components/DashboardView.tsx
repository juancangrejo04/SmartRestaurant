import React from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import {
  CalendarDays,
  Utensils,
  LayoutGrid,
  Clock,
  TrendingUp,
  AlertTriangle,
  Flame,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  ExternalLink,
  Star,
  MessageSquare,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { t, formatCurrency } = useI18n();
  const activeBranch = store.getActiveBranch();
  const activeTenant = store.getActiveTenant();
  const metrics = store.getDashboardMetrics(activeBranch.id);
  const recommendations = store.getOperationalRecommendations(activeBranch.id);
  const recentOrders = store.getOrders(activeBranch.id).slice(0, 4);
  const reviews = store.getReviews(activeBranch.id, activeTenant.id).slice(0, 3);
  const reviewStats = store.getReviewStats(activeBranch.id, activeTenant.id);

  return (
    <div className="space-y-6">
      {/* Title & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.dashboard.title}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {activeBranch.name} · {t.dashboard.subtitle}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate('kitchen')}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition-colors"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.dashboard.viewKitchenKds}</span>
          </button>
          <button
            onClick={() => onNavigate('reservations')}
            className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold shadow-md flex items-center space-x-1.5 transition-colors"
          >
            <span>{t.dashboard.viewAllReservations}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Today's Reservations */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{t.dashboard.todayReservations}</span>
            <CalendarDays className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{metrics.todayReservations}</div>
          <div className="text-[11px] text-emerald-400 mt-1 font-medium flex items-center space-x-1">
            <CheckCircle className="w-3 h-3" />
            <span>{t.dashboard.verified}</span>
          </div>
        </div>

        {/* Active Orders */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{t.dashboard.activeOrders}</span>
            <Utensils className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{metrics.activeOrders}</div>
          <div className="text-[11px] text-slate-400 mt-1">{t.dashboard.inProgressOrKds}</div>
        </div>

        {/* Table Occupancy */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{t.dashboard.tableOccupancy}</span>
            <LayoutGrid className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{metrics.occupancyPercent}%</div>
          <div className="text-[11px] text-slate-400 mt-1">
            {metrics.occupiedTables} / {metrics.totalTables} {t.menuManagement.tablesTab}
          </div>
        </div>

        {/* Kitchen Backlog */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{t.dashboard.kitchenBacklog}</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{metrics.kitchenBacklog}</div>
          <div className="text-[11px] text-amber-400 mt-1">{t.dashboard.hotStation}</div>
        </div>

        {/* Avg Prep Time */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{t.dashboard.avgPrepTime}</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{metrics.avgPrepTimeMinutes} min</div>
          <div className="text-[11px] text-slate-400 mt-1">{t.dashboard.slaTarget}</div>
        </div>

        {/* Today's Recorded Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">{t.dashboard.todayRevenue}</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-amber-400 truncate">
            {formatCurrency(metrics.todayRevenue, metrics.currency)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {t.dashboard.currencyLabel}: {metrics.currency}
          </div>
        </div>
      </div>

      {/* Main Content Grid: Recommendations Engine + Live Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Rule-Based Recommendations Engine */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {t.dashboard.recommendationsTitle}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {t.dashboard.recommendationsSubtitle}
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                Rule Engine v2.1
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className={`p-4 rounded-xl border transition-all ${
                    rec.priority === 'HIGH'
                      ? 'bg-rose-950/20 border-rose-900/50 hover:border-rose-700/60'
                      : rec.priority === 'MEDIUM'
                      ? 'bg-amber-950/20 border-amber-900/50 hover:border-amber-700/60'
                      : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            rec.priority === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : rec.priority === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {rec.priority === 'HIGH'
                            ? t.recommendations.priorityHigh
                            : rec.priority === 'MEDIUM'
                            ? t.recommendations.priorityMedium
                            : t.recommendations.priorityLow}
                        </span>
                        <h3 className="text-sm font-bold text-slate-100">{rec.title}</h3>
                      </div>
                      <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                        {rec.explanation}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-xs text-amber-300 font-medium">
                      <span className="text-slate-400">{t.recommendations.actionLabel}</span>{' '}
                      {rec.suggestedAction}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      Datos: {JSON.stringify(rec.justifyingData)}
                    </div>
                  </div>
                </div>
              ))}

              {recommendations.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-medium">{t.dashboard.noRecommendations}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Kitchen Backlog & Quick Dispatch */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <span>{t.dashboard.recentKitchenTickets}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              </h2>
              <button
                onClick={() => onNavigate('kitchen')}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
              >
                {t.dashboard.openKds}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {recentOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 bg-slate-800/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-all"
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-white font-mono">{ord.orderNumber}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        ord.status === 'RECEIVED'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : ord.status === 'PREPARING'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : ord.status === 'READY'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {ord.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 mt-2 font-medium">
                    {t.waiter.table} #{ord.tableNumber} · {ord.items.length} {t.dashboard.productsCount}
                  </div>

                  <div className="mt-1 text-[11px] text-slate-400 truncate">
                    {ord.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-mono text-amber-400 font-bold">
                      {formatCurrency(ord.total, ord.currency)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {ord.correlationId}
                    </span>
                  </div>
                </div>
              ))}

              {recentOrders.length === 0 && (
                <div className="py-6 text-center text-xs text-slate-400">
                  {t.dashboard.noRecentOrders}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Satisfaction & Reviews Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t.reviews.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {reviewStats.count} {t.reviews.totalReviews} · {reviewStats.average} / 5.0
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('reviews')}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold border border-slate-700 flex items-center space-x-1.5 transition-colors self-start sm:self-auto"
          >
            <span>{t.reviews.allRatings}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Snippet grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="p-3.5 bg-slate-800/50 border border-slate-800/80 rounded-xl space-y-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white truncate">{rev.customerName}</span>
                  <div className="flex items-center space-x-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3 h-3 ${
                          s <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-300 mt-2 line-clamp-3 italic">
                  "{rev.comment}"
                </p>
              </div>

              <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800 flex justify-between">
                <span>{new Date(rev.createdAt).toLocaleDateString()}</span>
                {rev.dishName && <span className="text-slate-400 truncate max-w-[120px]">{rev.dishName}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
