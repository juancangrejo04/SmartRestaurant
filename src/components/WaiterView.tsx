import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import { Table, Order, MenuItem } from '../types';
import { eventBus } from '../domain/events';
import {
  LayoutGrid,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Coffee,
  Plus,
  Bell,
  Check,
  X,
  Search,
  UtensilsCrossed,
  ChefHat,
  Send,
  Eye,
  ShoppingBag,
} from 'lucide-react';

interface CartItem {
  dish: MenuItem;
  quantity: number;
  notes: string;
}

export const WaiterView: React.FC = () => {
  const { t, formatCurrency, currentMarket } = useI18n();
  const activeBranch = store.getActiveBranch();
  const activeTenant = store.getActiveTenant();

  const [tables, setTables] = useState<Table[]>(() => store.getTables(activeBranch.id));
  const [orders, setOrders] = useState<Order[]>(() => store.getOrders(activeBranch.id));
  const [filterMode, setFilterMode] = useState<'ALL' | 'READY' | 'ACTIVE' | 'FREE'>('ALL');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal 1: Review Table Order
  const [reviewedTable, setReviewedTable] = useState<Table | null>(null);
  const [reviewedOrder, setReviewedOrder] = useState<Order | null>(null);

  // Modal 2: Take Order for Table
  const [orderTable, setOrderTable] = useState<Table | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchDish, setSearchDish] = useState<string>('');

  const menuCategories = store.getMenuCategories(activeTenant.id);
  const menuItems = store.getMenuItems(undefined, activeTenant.id);

  // Real-time synchronization via eventBus + Polling fallback
  useEffect(() => {
    const reload = () => {
      store.reloadFromStorage();
      setTables(store.getTables(activeBranch.id));
      setOrders(store.getOrders(activeBranch.id));
    };

    reload();
    const unsubscribe = eventBus.subscribeAll((event) => {
      if (
        event.aggregateType === 'Order' ||
        event.aggregateType === 'Kitchen' ||
        event.eventType === 'OrderReady' ||
        event.eventType === 'OrderStatusChanged' ||
        event.eventType === 'OrderAcceptedByKitchen' ||
        event.eventType === 'OrderDelivered'
      ) {
        reload();
      }
    });

    // 1.5s background polling ensures immediate cross-tab and cross-window sync
    const pollTimer = setInterval(() => {
      reload();
    }, 1500);

    return () => {
      unsubscribe();
      clearInterval(pollTimer);
    };
  }, [activeBranch.id]);

  // Find active order for a given table, strictly prioritizing READY orders so waiters see ready plates immediately!
  const getTableOrder = (tableId: string, tableNumber?: number): Order | undefined => {
    // 1. If ANY order for this table is READY in kitchen, prioritize it
    const readyOrder = orders.find(
      (o) =>
        (o.tableId === tableId || (tableNumber !== undefined && o.tableNumber === tableNumber)) &&
        o.status === 'READY'
    );
    if (readyOrder) return readyOrder;

    // 2. Otherwise return PREPARING order
    const preparingOrder = orders.find(
      (o) =>
        (o.tableId === tableId || (tableNumber !== undefined && o.tableNumber === tableNumber)) &&
        o.status === 'PREPARING'
    );
    if (preparingOrder) return preparingOrder;

    // 3. Otherwise return RECEIVED order
    return orders.find(
      (o) =>
        (o.tableId === tableId || (tableNumber !== undefined && o.tableNumber === tableNumber)) &&
        o.status === 'RECEIVED'
    );
  };

  // Deliver order to table action
  const handleMarkAsDelivered = (orderId: string, tableNumber: number) => {
    setErrorMsg(null);
    try {
      store.updateOrderStatus(orderId, 'DELIVERED', 'WAITER', `Entregado a la Mesa #${tableNumber} por el mesero`);
      setOrders(store.getOrders(activeBranch.id));
      setTables(store.getTables(activeBranch.id));
      setSuccessMsg(t.waiter.deliveredSuccess);
      if (reviewedOrder?.id === orderId) {
        setReviewedOrder(null);
        setReviewedTable(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || t.common.error);
    }
  };

  // Open detailed review modal
  const handleOpenReview = (table: Table, order: Order) => {
    setReviewedTable(table);
    setReviewedOrder(order);
  };

  // Open order taking modal for a table
  const handleOpenTakeOrder = (table: Table) => {
    setOrderTable(table);
    setCart([]);
    setSelectedCategory('ALL');
    setSearchDish('');
    setErrorMsg(null);
  };

  // Cart operations
  const handleAddToCart = (dish: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.dish.id === dish.id);
      if (existing) {
        return prev.map((item) =>
          item.dish.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { dish, quantity: 1, notes: '' }];
    });
  };

  const handleUpdateQuantity = (dishId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.dish.id === dishId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleUpdateItemNotes = (dishId: string, notes: string) => {
    setCart((prev) =>
      prev.map((item) => (item.dish.id === dishId ? { ...item, notes } : item))
    );
  };

  // Submit order taken by waiter
  const handleSubmitWaiterOrder = () => {
    if (!orderTable) return;
    if (cart.length === 0) {
      setErrorMsg(t.qrOrder.cartEmpty);
      return;
    }

    try {
      const result = store.createOrder({
        tenantId: activeTenant.id,
        branchId: activeBranch.id,
        tableId: orderTable.id,
        qrToken: orderTable.qrToken,
        idempotencyKey: `waiter-${orderTable.id}-${Date.now()}`,
        customerName: `${t.waiter.table} ${orderTable.number} (${t.roles.waiter})`,
        items: cart.map((c) => ({
          menuItemId: c.dish.id,
          quantity: c.quantity,
          notes: c.notes || undefined,
        })),
      });

      setSuccessMsg(
        `${t.qrOrder.orderSuccessTitle} (${t.kitchen.orderNumber}: ${result.order.orderNumber})`
      );
      setOrderTable(null);
      setCart([]);
      setOrders(store.getOrders(activeBranch.id));
      setTables(store.getTables(activeBranch.id));
    } catch (err: any) {
      setErrorMsg(err.message || t.common.error);
    }
  };

  // Filtered tables
  const readyOrders = orders.filter((o) => o.status === 'READY');
  const readyOrdersCount = readyOrders.length;

  const filteredTables = tables.filter((tbl) => {
    const activeOrder = getTableOrder(tbl.id, tbl.number);
    if (filterMode === 'READY') {
      return (
        activeOrder?.status === 'READY' ||
        readyOrders.some(
          (ro) => ro.tableId === tbl.id || ro.tableNumber === tbl.number
        )
      );
    }
    if (filterMode === 'ACTIVE') {
      return !!activeOrder;
    }
    if (filterMode === 'FREE') {
      return !activeOrder && tbl.status !== 'RESERVED';
    }
    return true;
  });

  const cartSubtotal = cart.reduce((acc, it) => acc + it.dish.price * it.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Title & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{t.waiter.title}</h1>
          </div>
          <p className="text-sm text-stone-400 mt-1">
            {activeBranch.name} · {t.waiter.subtitle}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center space-x-1.5 bg-stone-900 p-1 rounded-xl border border-stone-800 text-xs">
          <button
            onClick={() => setFilterMode('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterMode === 'ALL'
                ? 'bg-amber-500 text-stone-950 font-bold'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            {t.waiter.allTables} ({tables.length})
          </button>
          <button
            onClick={() => setFilterMode('READY')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center space-x-1 ${
              filterMode === 'READY'
                ? 'bg-amber-500 text-stone-950 font-bold shadow-md ring-1 ring-amber-400'
                : readyOrdersCount > 0
                ? 'text-amber-400 bg-amber-500/15 border border-amber-500/40 animate-pulse font-bold'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>{t.waiter.readyToDeliver} ({readyOrdersCount})</span>
          </button>
          <button
            onClick={() => setFilterMode('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterMode === 'ACTIVE'
                ? 'bg-amber-500 text-stone-950 font-bold'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            {t.waiter.withOrder} ({tables.filter((t) => !!getTableOrder(t.id, t.number)).length})
          </button>
          <button
            onClick={() => setFilterMode('FREE')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterMode === 'FREE'
                ? 'bg-amber-500 text-stone-950 font-bold'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            {t.waiter.free} ({tables.filter((t) => !getTableOrder(t.id, t.number) && t.status !== 'RESERVED').length})
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}>×</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)}>×</button>
        </div>
      )}

      {/* Urgent Ready Orders Banner */}
      {readyOrdersCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/50 text-amber-200 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {readyOrdersCount} {t.waiter.readyBannerTitle}
              </h3>
              <p className="text-xs text-amber-300/80 mt-0.5">
                {t.waiter.readyBannerDesc}
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilterMode('READY')}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl shadow transition-colors self-start sm:self-auto"
          >
            {t.waiter.viewReadyTables}
          </button>
        </div>
      )}

      {/* Salon Floor Map */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((tbl) => {
          const activeOrder = getTableOrder(tbl.id, tbl.number);
          const isReady = activeOrder?.status === 'READY';
          const isPreparing = activeOrder?.status === 'PREPARING';
          const isReceived = activeOrder?.status === 'RECEIVED';

          return (
            <div
              key={tbl.id}
              className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                isReady
                  ? 'bg-stone-900 border-emerald-500 shadow-xl ring-2 ring-emerald-500/40'
                  : activeOrder
                  ? 'bg-stone-900 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
                  : tbl.status === 'RESERVED'
                  ? 'bg-stone-900 border-blue-500/40'
                  : 'bg-stone-900 border-stone-800'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                  <div className="flex items-center space-x-2">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isReady
                          ? 'bg-emerald-500 text-stone-950 animate-bounce'
                          : activeOrder
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-stone-950 text-stone-300'
                      }`}
                    >
                      {tbl.number}
                    </div>
                    <div>
                      <span className="font-bold text-white text-sm">{t.waiter.table} #{tbl.number}</span>
                      <div className="text-[11px] text-stone-400">{tbl.locationArea}</div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isReady
                        ? 'bg-emerald-500 text-stone-950 font-extrabold animate-pulse'
                        : isPreparing
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : isReceived
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : tbl.status === 'RESERVED'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {isReady
                      ? t.waiter.readyInKitchen
                      : isPreparing
                      ? t.waiter.inKitchen
                      : isReceived
                      ? t.waiter.received
                      : tbl.status === 'RESERVED'
                      ? t.waiter.reserved
                      : t.waiter.free}
                  </span>
                </div>

                {/* Details */}
                <div className="mt-3 space-y-2 text-xs text-stone-300">
                  <div className="flex justify-between text-stone-400">
                    <span>{t.waiter.capacity}:</span>
                    <span className="font-medium text-white">{tbl.capacity} {t.common.people}</span>
                  </div>

                  {activeOrder ? (
                    <div
                      onClick={() => handleOpenReview(tbl, activeOrder)}
                      className="mt-3 pt-3 border-t border-stone-800 bg-stone-950/60 p-2.5 rounded-xl cursor-pointer hover:bg-stone-950 transition-colors"
                      title={t.waiter.reviewOrder}
                    >
                      <div className="flex justify-between items-center text-[11px] font-semibold text-amber-400">
                        <span>{activeOrder.orderNumber}</span>
                        <span className="text-[10px] text-stone-400 flex items-center space-x-1">
                          <Eye className="w-3 h-3 text-stone-400" />
                          <span>{t.waiter.reviewOrder}</span>
                        </span>
                      </div>

                      {/* Items Preview */}
                      <div className="text-[11px] text-stone-300 mt-1.5 space-y-0.5 line-clamp-2">
                        {activeOrder.items.map((it) => (
                          <div key={it.id} className="flex justify-between">
                            <span>
                              <strong className="text-amber-400">{it.quantity}x</strong> {it.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="text-xs font-bold text-white font-mono mt-2 pt-1 border-t border-stone-800 flex justify-between items-center">
                        <span className="text-stone-400 text-[10px] font-normal">{t.waiter.total}</span>
                        <span>{formatCurrency(activeOrder.total, activeOrder.currency)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 text-[11px] text-stone-500 italic text-center border-t border-stone-800/60">
                      {t.waiter.noOrderActive}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-stone-800 space-y-2">
                {/* 1. If READY: Prominent "Marcar como entregado" button */}
                {isReady && (
                  <button
                    onClick={() => handleMarkAsDelivered(activeOrder.id, tbl.number)}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-bold shadow-lg transition-all flex items-center justify-center space-x-1.5 animate-pulse"
                  >
                    <CheckCircle2 className="w-4 h-4 text-stone-950" />
                    <span>{t.waiter.markAsDelivered}</span>
                  </button>
                )}

                {/* 2. If ACTIVE (not ready): Review order button */}
                {activeOrder && !isReady && (
                  <button
                    onClick={() => handleOpenReview(tbl, activeOrder)}
                    className="w-full py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.waiter.reviewOrder} ({activeOrder.items.length})</span>
                  </button>
                )}

                {/* 3. Take order for this table button */}
                <button
                  onClick={() => handleOpenTakeOrder(tbl)}
                  className={`w-full py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 ${
                    activeOrder
                      ? 'bg-stone-950 hover:bg-stone-800 text-stone-300 border border-stone-800'
                      : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{activeOrder ? t.waiter.addMoreDishes : t.waiter.takeOrder}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTables.length === 0 && (
        <div className="py-16 text-center text-stone-400 bg-stone-900 border border-stone-800 rounded-3xl">
          <LayoutGrid className="w-12 h-12 text-stone-600 mx-auto mb-3" />
          <p className="text-base font-bold text-stone-200">{t.waiter.noTables}</p>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: REVISAR PEDIDO DETALLADO DE CADA MESA           */}
      {/* ======================================================== */}
      {reviewedTable && reviewedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setReviewedTable(null);
                setReviewedOrder(null);
              }}
              className="absolute top-4 right-4 text-stone-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 pb-4 border-b border-stone-800">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 font-extrabold flex items-center justify-center text-base">
                #{reviewedTable.number}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <span>{t.waiter.orderDetail}: {reviewedOrder.orderNumber}</span>
                </h2>
                <div className="text-xs text-stone-400 mt-0.5">
                  {t.waiter.table} #{reviewedTable.number} ({reviewedTable.locationArea}) · {reviewedOrder.customerName}
                </div>
              </div>
            </div>

            {/* Status Banner */}
            <div className="mt-4 p-3 rounded-2xl bg-stone-950 border border-stone-800 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-stone-400">{t.kitchen.kdsStatus}:</div>
                <div className="text-sm font-bold text-amber-400 uppercase mt-0.5">
                  {reviewedOrder.status === 'READY'
                    ? t.waiter.readyInKitchen
                    : reviewedOrder.status === 'PREPARING'
                    ? t.waiter.inKitchen
                    : reviewedOrder.status === 'RECEIVED'
                    ? t.waiter.received
                    : reviewedOrder.status}
                </div>
              </div>

              {reviewedOrder.status === 'READY' && (
                <button
                  onClick={() => handleMarkAsDelivered(reviewedOrder.id, reviewedTable.number)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-bold shadow-md transition-colors flex items-center space-x-1.5 animate-pulse"
                >
                  <Check className="w-4 h-4" />
                  <span>{t.waiter.markAsDelivered}</span>
                </button>
              )}
            </div>

            {/* Items List */}
            <div className="mt-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                {t.waiter.dishesRequested} ({reviewedOrder.items.length})
              </h3>

              <div className="space-y-2.5 divide-y divide-stone-800/80">
                {reviewedOrder.items.map((item) => (
                  <div key={item.id} className="pt-2.5 first:pt-0 flex items-start justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">
                        <span className="text-amber-400 mr-1.5">{item.quantity}x</span>
                        {item.name}
                      </div>
                      {item.notes && (
                        <div className="text-[11px] text-amber-300 italic mt-0.5 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-900/30 inline-block">
                          {item.notes}
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-mono font-bold text-stone-200">
                      {formatCurrency(item.subtotal, reviewedOrder.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals Breakdown */}
            <div className="mt-6 pt-4 border-t border-stone-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-stone-400">
                <span>{t.waiter.subtotal}</span>
                <span className="font-mono">{formatCurrency(reviewedOrder.subtotal, reviewedOrder.currency)}</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>{t.waiter.tax}</span>
                <span className="font-mono">{formatCurrency(reviewedOrder.tax, reviewedOrder.currency)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-stone-800">
                <span>{t.waiter.total}</span>
                <span className="font-mono text-amber-400">
                  {formatCurrency(reviewedOrder.total, reviewedOrder.currency)}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-4 border-t border-stone-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setReviewedTable(null);
                  setReviewedOrder(null);
                }}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium"
              >
                {t.waiter.close}
              </button>

              {reviewedOrder.status === 'READY' ? (
                <button
                  type="button"
                  onClick={() => handleMarkAsDelivered(reviewedOrder.id, reviewedTable.number)}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-bold shadow-md transition-colors flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-stone-950" />
                  <span>{t.waiter.markAsDelivered}</span>
                </button>
              ) : (
                <span className="text-[11px] text-stone-500 italic">
                  {t.kitchen.inPrepOrders}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: TOMAR PEDIDO POR LA MESA (PEDIDO DEL MESERO)     */}
      {/* ======================================================== */}
      {orderTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/85 backdrop-blur-sm">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl relative max-h-[92vh] flex flex-col">
            <button
              onClick={() => {
                setOrderTable(null);
                setCart([]);
              }}
              className="absolute top-4 right-4 text-stone-400 hover:text-white z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 pb-3 border-b border-stone-800">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-stone-950 font-extrabold flex items-center justify-center text-base">
                #{orderTable.number}
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                  <span>{t.waiter.takeOrder} #{orderTable.number}</span>
                </h2>
                <div className="text-xs text-stone-400">
                  {orderTable.locationArea} · {t.waiter.capacity}: {orderTable.capacity} {t.common.people} · {t.common.currency}: {activeBranch.commercialCurrency}
                </div>
              </div>
            </div>

            {/* Content Body: Grid of Menu + Current Cart */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 overflow-hidden">
              {/* Left: Dish Catalog (2 cols) */}
              <div className="md:col-span-2 flex flex-col space-y-3 overflow-hidden">
                {/* Search & Categories */}
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={t.waiter.searchPlaceholder}
                      value={searchDish}
                      onChange={(e) => setSearchDish(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="ALL">{t.waiter.allCategories}</option>
                    {menuCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name[currentMarket] || c.name['es-CO']}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dishes list */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                  {menuItems
                    .filter((item) => {
                      if (!item.isAvailable) return false;
                      if (selectedCategory !== 'ALL' && item.categoryId !== selectedCategory) return false;
                      if (searchDish.trim()) {
                        const name = (item.name[currentMarket] || item.name['es-CO']).toLowerCase();
                        if (!name.includes(searchDish.toLowerCase())) return false;
                      }
                      return true;
                    })
                    .map((dish) => {
                      const inCart = cart.find((c) => c.dish.id === dish.id);

                      return (
                        <div
                          key={dish.id}
                          className="bg-stone-950 border border-stone-800/80 rounded-2xl p-2.5 flex items-center justify-between hover:border-stone-700 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            {dish.imageUrl ? (
                              <img
                                src={dish.imageUrl}
                                alt={dish.name[currentMarket]}
                                className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-stone-900 flex items-center justify-center text-stone-600 flex-shrink-0">
                                <UtensilsCrossed className="w-5 h-5" />
                              </div>
                            )}
                            <div>
                              <div className="text-xs font-bold text-white">
                                {dish.name[currentMarket] || dish.name['es-CO']}
                              </div>
                              <div className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                                {formatCurrency(dish.price, dish.currency)}
                              </div>
                            </div>
                          </div>

                          <div>
                            {inCart ? (
                              <div className="flex items-center space-x-1.5 bg-stone-900 p-1 rounded-xl border border-stone-800">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(dish.id, -1)}
                                  className="w-6 h-6 rounded-lg bg-stone-800 hover:bg-stone-700 text-white font-bold flex items-center justify-center text-xs"
                                >
                                  -
                                </button>
                                <span className="font-bold text-amber-400 text-xs px-1">
                                  {inCart.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(dish.id, 1)}
                                  className="w-6 h-6 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold flex items-center justify-center text-xs"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddToCart(dish)}
                                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center space-x-1 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>{t.waiter.add}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Right: Order Summary & Send (1 col) */}
              <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.waiter.tableOrder}</span>
                    </span>
                    <span className="text-[11px] text-stone-400">{cart.length} {t.kitchen.itemsCount}</span>
                  </div>

                  {/* Cart Items List */}
                  <div className="mt-3 flex-1 overflow-y-auto space-y-2.5 max-h-56 pr-1 divide-y divide-stone-800/80">
                    {cart.map((item) => (
                      <div key={item.dish.id} className="pt-2 first:pt-0">
                        <div className="flex items-start justify-between text-xs">
                          <span className="font-semibold text-white">
                            <strong className="text-amber-400 mr-1">{item.quantity}x</strong>
                            {item.dish.name[currentMarket] || item.dish.name['es-CO']}
                          </span>
                          <span className="font-mono text-stone-300">
                            {formatCurrency(item.dish.price * item.quantity, item.dish.currency)}
                          </span>
                        </div>

                        {/* Note input */}
                        <input
                          type="text"
                          placeholder={t.waiter.notePlaceholder}
                          value={item.notes}
                          onChange={(e) => handleUpdateItemNotes(item.dish.id, e.target.value)}
                          className="mt-1 w-full bg-stone-900 border border-stone-800 rounded-lg px-2 py-0.5 text-[10px] text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    ))}

                    {cart.length === 0 && (
                      <div className="py-10 text-center text-stone-500 text-xs italic">
                        {t.qrOrder.cartEmpty}
                      </div>
                    )}
                  </div>
                </div>

                {/* Subtotal & Confirm Button */}
                <div className="pt-3 border-t border-stone-800 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-400">{t.waiter.estimatedTotal}</span>
                    <span className="text-sm font-bold text-amber-400 font-mono">
                      {formatCurrency(cartSubtotal, activeBranch.commercialCurrency)}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={cart.length === 0}
                    onClick={handleSubmitWaiterOrder}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md transition-colors disabled:opacity-50 flex items-center justify-center space-x-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t.waiter.sendToKitchen}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
