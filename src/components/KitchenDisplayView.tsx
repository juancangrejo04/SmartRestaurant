import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import { Order, OrderStatus } from '../types';
import { eventBus } from '../domain/events';
import {
  Flame,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChefHat,
  Bell,
  ArrowRight,
  Filter,
  Check,
  RefreshCw,
  Shield,
  Trash2,
  XCircle,
} from 'lucide-react';

export const KitchenDisplayView: React.FC = () => {
  const { t, formatTime } = useI18n();
  const activeBranch = store.getActiveBranch();
  const currentUser = store.getCurrentUser();
  const isAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';

  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [orders, setOrders] = useState<Order[]>(() => store.getOrders(activeBranch.id));
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleAdminOverrideStatus = (orderId: string, targetStatus: OrderStatus) => {
    setActionError(null);
    try {
      store.overrideOrderStatus(orderId, targetStatus, currentUser.role, `Cambio de estado administrativo`);
      setOrders(store.getOrders(activeBranch.id));
      setActionSuccess(`Estado de comanda actualizado a ${targetStatus}`);
    } catch (err: any) {
      setActionError(err.message || 'Error al modificar estado de comanda');
    }
  };

  const handleAdminCancelOrder = (orderId: string, orderNum: string) => {
    if (confirm(`¿Cancelar comanda ${orderNum}? Se marcará como CANCELLED.`)) {
      setActionError(null);
      try {
        store.cancelOrder(orderId, 'Cancelada por el administrador');
        setOrders(store.getOrders(activeBranch.id));
        setActionSuccess(`Comanda ${orderNum} cancelada.`);
      } catch (err: any) {
        setActionError(err.message || 'Error al cancelar la comanda');
      }
    }
  };

  const handleAdminDeleteOrder = (orderId: string, orderNum: string) => {
    if (confirm(`¿ELIMINAR DEFINITIVAMENTE la comanda ${orderNum} del sistema? Esta acción no se puede deshacer.`)) {
      setActionError(null);
      try {
        store.deleteOrder(orderId);
        setOrders(store.getOrders(activeBranch.id));
        setActionSuccess(`Comanda ${orderNum} eliminada del sistema.`);
      } catch (err: any) {
        setActionError(err.message || 'Error al eliminar la comanda');
      }
    }
  };

  // Auto-refresh timer for elapsed times every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to real-time order events
  useEffect(() => {
    const reload = () => {
      store.reloadFromStorage();
      setOrders(store.getOrders(activeBranch.id));
    };

    reload();
    const unsubscribe = eventBus.subscribeAll((event) => {
      if (
        event.aggregateType === 'Order' ||
        event.aggregateType === 'Kitchen' ||
        event.eventType === 'OrderCreated' ||
        event.eventType === 'OrderReady' ||
        event.eventType === 'OrderStatusChanged' ||
        event.eventType === 'OrderDelivered'
      ) {
        reload();
      }
    });

    const poll = setInterval(reload, 2000);

    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [activeBranch.id]);

  const handleAdvanceStatus = (orderId: string, targetStatus: OrderStatus) => {
    setActionError(null);
    try {
      store.updateOrderStatus(orderId, targetStatus, 'KITCHEN');
      setOrders(store.getOrders(activeBranch.id));
    } catch (err: any) {
      setActionError(err.message || t.kitchen.invalidTransitionError);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (filterStatus === 'ALL') {
      return o.status !== 'CANCELLED' && o.status !== 'DELIVERED';
    }
    return o.status === filterStatus;
  });

  // Calculate elapsed minutes since order creation
  const getElapsedMinutes = (createdAt: string): number => {
    const created = new Date(createdAt).getTime();
    return Math.max(0, Math.floor((currentTime - created) / 60000));
  };

  return (
    <div className="space-y-6">
      {/* Title & Stats Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ChefHat className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{t.kitchen.title}</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {activeBranch.name} · {t.kitchen.subtitle}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterStatus === 'ALL'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.kitchen.activeTickets} ({orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length})
          </button>
          <button
            onClick={() => setFilterStatus('RECEIVED')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterStatus === 'RECEIVED'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.kitchen.waitingOrders} ({orders.filter((o) => o.status === 'RECEIVED').length})
          </button>
          <button
            onClick={() => setFilterStatus('PREPARING')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterStatus === 'PREPARING'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.kitchen.inPrepOrders} ({orders.filter((o) => o.status === 'PREPARING').length})
          </button>
          <button
            onClick={() => setFilterStatus('READY')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterStatus === 'READY'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.kitchen.readyOrders} ({orders.filter((o) => o.status === 'READY').length})
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)}>×</button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)}>×</button>
        </div>
      )}

      {isAdmin && (
        <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-600/30 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              {t.kitchen.adminMode}
            </span>
          </div>
        </div>
      )}

      {/* KDS Ticket Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredOrders.map((ord) => {
          const elapsed = getElapsedMinutes(ord.createdAt);
          const isUrgent = elapsed >= 15;

          return (
            <div
              key={ord.id}
              className={`rounded-2xl border shadow-md flex flex-col justify-between overflow-hidden transition-all ${
                ord.status === 'RECEIVED'
                  ? 'bg-slate-900 border-amber-500/50 ring-1 ring-amber-500/20'
                  : ord.status === 'PREPARING'
                  ? 'bg-slate-900 border-blue-500/50 ring-1 ring-blue-500/20'
                  : ord.status === 'READY'
                  ? 'bg-slate-900 border-emerald-500/50 ring-1 ring-emerald-500/20'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              {/* Ticket Card Header */}
              <div
                className={`p-3.5 border-b flex items-center justify-between ${
                  isUrgent
                    ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                    : ord.status === 'RECEIVED'
                    ? 'bg-amber-950/30 border-amber-900/60 text-amber-200'
                    : ord.status === 'PREPARING'
                    ? 'bg-blue-950/30 border-blue-900/60 text-blue-200'
                    : 'bg-emerald-950/30 border-emerald-900/60 text-emerald-200'
                }`}
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-sm text-white">
                      {ord.orderNumber}
                    </span>
                    <span className="font-extrabold text-xs px-2 py-0.5 rounded bg-slate-950/80 text-amber-400 border border-slate-800">
                      {t.waiter.table} #{ord.tableNumber}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`flex items-center space-x-1 font-mono font-bold text-xs ${
                      isUrgent ? 'text-rose-400 animate-pulse' : 'text-slate-300'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{elapsed}m</span>
                  </div>
                  {isUrgent && (
                    <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-950/80 px-1.5 py-0.2 rounded border border-rose-800">
                      {t.kitchen.urgentBadge}
                    </span>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-72 divide-y divide-slate-800/80">
                {ord.items.map((item) => (
                  <div key={item.id} className="pt-2.5 first:pt-0">
                    <div className="flex items-start justify-between text-xs font-semibold">
                      <span className="text-white">
                        <strong className="text-amber-400 text-sm mr-1.5">{item.quantity}x</strong>
                        {item.name}
                      </span>
                    </div>

                    {item.notes && (
                      <div className="mt-1 text-[11px] text-amber-300 italic bg-amber-950/30 px-2 py-1 rounded border border-amber-900/40 flex items-start space-x-1">
                        <span className="font-bold">Nota:</span>
                        <span>{item.notes}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Status Machine Action Buttons */}
              <div className="p-3 bg-slate-950 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{t.kitchen.kdsStatus}:</span>
                  <span className="font-bold text-white uppercase font-mono">
                    {t.orderStatuses[ord.status.toLowerCase() as keyof typeof t.orderStatuses] || ord.status}
                  </span>
                </div>

                {ord.status === 'RECEIVED' && (
                  <button
                    onClick={() => handleAdvanceStatus(ord.id, 'PREPARING')}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>{t.kitchen.advanceToPreparing}</span>
                  </button>
                )}

                {ord.status === 'PREPARING' && (
                  <button
                    onClick={() => handleAdvanceStatus(ord.id, 'READY')}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{t.kitchen.advanceToReady}</span>
                  </button>
                )}

                {ord.status === 'READY' && (
                  <button
                    onClick={() => handleAdvanceStatus(ord.id, 'DELIVERED')}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t.kitchen.advanceToDelivered}</span>
                  </button>
                )}

                {ord.status === 'DELIVERED' && (
                  <div className="text-center text-xs text-slate-400 py-1 font-medium">
                    {t.kitchen.orderDeliveredAndClosed}
                  </div>
                )}

                {/* Administrative Override Controls */}
                {isAdmin && (
                  <div className="pt-2 mt-2 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-400 flex items-center space-x-1">
                        <Shield className="w-3 h-3" />
                        <span>{t.roles.admin}</span>
                      </span>
                      <div className="flex items-center space-x-1.5">
                        {ord.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleAdminCancelOrder(ord.id, ord.orderNumber)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold px-2 py-0.5 rounded hover:bg-rose-950/40 border border-rose-900/50 flex items-center space-x-1"
                            title={t.kitchen.cancelOrder}
                          >
                            <XCircle className="w-3 h-3" />
                            <span>{t.kitchen.cancelOrder}</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleAdminDeleteOrder(ord.id, ord.orderNumber)}
                          className="text-[10px] text-slate-400 hover:text-rose-400 font-semibold p-1 rounded hover:bg-rose-950/40"
                          title={t.kitchen.deleteOrder}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{t.kitchen.forceStatus}</span>
                      <select
                        value={ord.status}
                        onChange={(e) => handleAdminOverrideStatus(ord.id, e.target.value as OrderStatus)}
                        className="w-full bg-slate-900 border border-slate-700 text-amber-300 text-[10px] font-bold rounded px-1.5 py-1 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      >
                        <option value="RECEIVED">{t.orderStatuses.received} (RECEIVED)</option>
                        <option value="PREPARING">{t.orderStatuses.preparing} (PREPARING)</option>
                        <option value="READY">{t.orderStatuses.ready} (READY)</option>
                        <option value="DELIVERED">{t.orderStatuses.delivered} (DELIVERED)</option>
                        <option value="CANCELLED">{t.orderStatuses.cancelled} (CANCELLED)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredOrders.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
            <ChefHat className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-base font-bold text-slate-200">{t.kitchen.noOrders}</p>
          </div>
        )}
      </div>
    </div>
  );
};
