import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import { MenuItem, Table, Order } from '../types';
import { eventBus } from '../domain/events';
import {
  ShoppingCart,
  Plus,
  Minus,
  Clock,
  Send,
  Utensils,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  QrCode,
  X,
  AlertCircle,
  Receipt,
  Star,
  MessageSquare,
} from 'lucide-react';

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes: string;
}

interface QrOrderViewProps {
  onNavigateToReviews?: () => void;
}

export const QrOrderView: React.FC<QrOrderViewProps> = ({ onNavigateToReviews }) => {
  const { t, formatCurrency, currentMarket } = useI18n();
  const activeTenant = store.getActiveTenant();
  const activeBranch = store.getActiveBranch();
  const tables = store.getTables(activeBranch.id);

  const [selectedTable, setSelectedTable] = useState<Table>(() => tables[0] || store.getTables()[0]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [showMobileCart, setShowMobileCart] = useState<boolean>(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(
    () => `idem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  );

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewName, setReviewName] = useState<string>('');
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  const categories = store.getMenuCategories(activeTenant.id);
  const menuItems = store.getMenuItems(
    selectedCategory === 'all' ? undefined : selectedCategory,
    activeTenant.id
  );

  // Sync active order status in real time via event bus
  useEffect(() => {
    if (!submittedOrder) return;
    const unsubscribe = eventBus.subscribeAll((event) => {
      if (
        event.aggregateId === submittedOrder.id &&
        (event.eventType === 'OrderStatusChanged' ||
          event.eventType === 'OrderAcceptedByKitchen' ||
          event.eventType === 'OrderReady' ||
          event.eventType === 'OrderDelivered')
      ) {
        const fresh = store.getOrderById(submittedOrder.id);
        if (fresh) setSubmittedOrder({ ...fresh });
      }
    });
    return () => unsubscribe();
  }, [submittedOrder]);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.menuItem.id === item.id);
      if (existing) {
        return prev.map((ci) =>
          ci.menuItem.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prev, { menuItem: item, quantity: 1, notes: '' }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((ci) => {
          if (ci.menuItem.id === itemId) {
            const newQty = ci.quantity + delta;
            return newQty > 0 ? { ...ci, quantity: newQty } : null;
          }
          return ci;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const updateItemNotes = (itemId: string, notes: string) => {
    setCart((prev) =>
      prev.map((ci) => (ci.menuItem.id === itemId ? { ...ci, notes } : ci))
    );
  };

  const clientSubtotal = cart.reduce((sum, ci) => sum + ci.menuItem.price * ci.quantity, 0);
  const taxRate =
    activeBranch.commercialCurrency === 'COP'
      ? 0.08
      : activeBranch.commercialCurrency === 'MXN'
      ? 0.16
      : 0.1;
  const clientTax = Math.round(clientSubtotal * taxRate);
  const clientTotal = clientSubtotal + clientTax;
  const totalItemCount = cart.reduce((acc, ci) => acc + ci.quantity, 0);

  const handleSubmitOrder = () => {
    if (cart.length === 0 || !selectedTable) return;
    setIsSubmitting(true);

    setTimeout(() => {
      try {
        const result = store.createOrder({
          tenantId: activeTenant.id,
          branchId: activeBranch.id,
          tableId: selectedTable.id,
          qrToken: selectedTable.qrToken,
          idempotencyKey,
          customerName: `${t.waiter.table} #${selectedTable.number}`,
          items: cart.map((ci) => ({
            menuItemId: ci.menuItem.id,
            quantity: ci.quantity,
            notes: ci.notes,
          })),
        });

        setSubmittedOrder(result.order);
        setCart([]);
        setShowMobileCart(false);
        setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
      } catch (err: any) {
        alert(`${t.common.error}: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
    }, 400);
  };

  const handleSaveReviewFromOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;

    store.addReview({
      tenantId: activeTenant.id,
      branchId: activeBranch.id,
      customerName: reviewName.trim() || `${t.waiter.table} #${selectedTable.number}`,
      rating: reviewRating,
      comment: reviewComment.trim(),
      orderNumber: submittedOrder?.orderNumber,
      dishName: submittedOrder?.items[0]?.name,
      isVerifiedPurchase: true,
    });

    setReviewSuccess(t.reviews.reviewSuccess);
    setTimeout(() => {
      setShowReviewModal(false);
      setReviewComment('');
    }, 1500);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Restaurant Hero Welcome Banner */}
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{t.qrOrder.openTableService}</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              {activeTenant.name}
            </h1>
            <p className="text-xs text-stone-400 mt-1">
              {activeBranch.name} · {activeBranch.address}
            </p>
          </div>

          {/* Table Selector (Simulates scanning table QR) */}
          <div className="bg-stone-950 p-2 rounded-2xl border border-stone-800 flex items-center space-x-2">
            <span className="text-xs font-semibold text-stone-400 pl-2 flex items-center space-x-1.5">
              <QrCode className="w-4 h-4 text-amber-500" />
              <span>{t.qrOrder.yourTable}:</span>
            </span>
            <div className="flex items-center space-x-1">
              {tables.map((tbl) => (
                <button
                  key={tbl.id}
                  onClick={() => {
                    setSelectedTable(tbl);
                    setSubmittedOrder(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedTable.id === tbl.id
                      ? 'bg-amber-500 text-stone-950 shadow-md font-extrabold'
                      : 'text-stone-300 hover:text-white hover:bg-stone-800'
                  }`}
                >
                  {t.waiter.table} {tbl.number}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Order Tracker Banner if an order is active */}
      {submittedOrder && (
        <div className="bg-stone-900 border border-emerald-500/40 rounded-3xl p-5 shadow-lg animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-stone-800">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  {t.qrOrder.orderSuccessTitle}
                </span>
                <span className="text-[11px] text-stone-400">
                  {t.customerOrders.order} #{submittedOrder.orderNumber} · {t.waiter.table} {submittedOrder.tableNumber}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-stone-400">{t.kitchen.kdsStatus}:</span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                  submittedOrder.status === 'RECEIVED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : submittedOrder.status === 'PREPARING'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse'
                    : submittedOrder.status === 'READY'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : submittedOrder.status === 'DELIVERED'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-stone-800 text-stone-300'
                }`}
              >
                {t.orderStatuses[submittedOrder.status.toLowerCase() as keyof typeof t.orderStatuses] ||
                  submittedOrder.status}
              </span>
            </div>
          </div>

          {/* Stepper Timeline */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
            {[
              { key: 'RECEIVED', label: `1. ${t.orderStatuses.received}` },
              { key: 'PREPARING', label: `2. ${t.orderStatuses.preparing}` },
              { key: 'READY', label: `3. ${t.orderStatuses.ready}` },
              { key: 'DELIVERED', label: `4. ${t.orderStatuses.delivered}` },
            ].map((step, idx) => {
              const statusSequence = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'];
              const currentIdx = statusSequence.indexOf(submittedOrder.status);
              const isPassed = currentIdx >= idx;
              const isCurrent = currentIdx === idx;

              return (
                <div
                  key={step.key}
                  className={`p-2 rounded-xl transition-all ${
                    isCurrent
                      ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                      : isPassed
                      ? 'text-emerald-400 font-medium'
                      : 'text-stone-600 bg-stone-950/40'
                  }`}
                >
                  <div className="text-[11px] font-semibold">{step.label}</div>
                </div>
              );
            })}
          </div>

          {/* Prompt to leave a review once customer has placed order */}
          <div className="mt-4 pt-3.5 border-t border-stone-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-stone-950/70 p-3.5 rounded-2xl">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <Star className="w-5 h-5 fill-amber-400" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  {t.reviews.orderPromptTitle}
                </span>
                <span className="text-[11px] text-stone-400">
                  {t.reviews.orderPromptDesc}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  setReviewSuccess(null);
                  setShowReviewModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-all shadow flex items-center space-x-1.5 self-start sm:self-auto"
              >
                <Star className="w-3.5 h-3.5 fill-stone-950" />
                <span>{t.reviews.leaveReview}</span>
              </button>
              {onNavigateToReviews && (
                <button
                  type="button"
                  onClick={onNavigateToReviews}
                  className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold transition-all"
                >
                  {t.reviews.allRatings}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Menu Catalog & Desktop Cart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Menu Categories & Real Food Dish Cards */}
        <div className="lg:col-span-2 space-y-5">
          {/* Category Tabs */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-stone-950 font-extrabold shadow-sm'
                  : 'bg-stone-900 border border-stone-800 text-stone-300 hover:bg-stone-800'
              }`}
            >
              {t.qrOrder.allDishes}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-amber-500 text-stone-950 font-extrabold shadow-sm'
                    : 'bg-stone-900 border border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                {cat.name[currentMarket] || cat.name['es-CO']}
              </button>
            ))}
          </div>

          {/* Dish Cards Grid with Real Photography */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {menuItems.map((dish) => {
              const name = dish.name[currentMarket] || dish.name['es-CO'];
              const desc = dish.description[currentMarket] || dish.description['es-CO'];
              const inCart = cart.find((c) => c.menuItem.id === dish.id);

              return (
                <div
                  key={dish.id}
                  className="bg-stone-900 border border-stone-800 hover:border-stone-700 rounded-3xl overflow-hidden shadow-sm flex flex-col justify-between transition-all group"
                >
                  <div>
                    {/* Real Food Image (Requirement 5) */}
                    {dish.imageUrl ? (
                      <div className="relative h-44 w-full overflow-hidden bg-stone-950">
                        <img
                          src={dish.imageUrl}
                          alt={name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute top-3 right-3 bg-stone-950/80 backdrop-blur-md px-2.5 py-1 rounded-xl text-xs font-extrabold text-amber-400 font-mono shadow-md border border-stone-800">
                          {formatCurrency(dish.price, dish.currency)}
                        </div>
                      </div>
                    ) : (
                      <div className="h-28 bg-stone-950 flex items-center justify-center text-stone-600">
                        <Utensils className="w-8 h-8" />
                      </div>
                    )}

                    <div className="p-4 sm:p-5">
                      <h3 className="font-bold text-white text-base leading-snug group-hover:text-amber-400 transition-colors">
                        {name}
                      </h3>
                      <p className="text-xs text-stone-400 mt-2 leading-relaxed line-clamp-3">
                        {desc}
                      </p>

                      <div className="mt-3 flex items-center space-x-3 text-[11px] text-stone-400">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-stone-400" />
                          <span>~{dish.preparationMinutes} min</span>
                        </span>
                        {dish.allergens && dish.allergens.length > 0 && (
                          <span className="text-stone-400 font-medium">
                            {t.qrOrder.contains}: {dish.allergens.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Add Button */}
                  <div className="px-4 sm:px-5 pb-4 pt-1 flex items-center justify-between border-t border-stone-800/80">
                    <span className="text-xs font-mono font-bold text-stone-400">
                      {dish.currency}
                    </span>

                    {dish.isAvailable ? (
                      inCart ? (
                        <div className="flex items-center space-x-2 bg-stone-950 px-2 py-1 rounded-xl border border-stone-800">
                          <button
                            onClick={() => updateQuantity(dish.id, -1)}
                            className="w-6 h-6 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center justify-center text-xs font-bold transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-extrabold text-amber-400 px-1">
                            {inCart.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(dish.id, 1)}
                            className="w-6 h-6 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center justify-center text-xs font-bold transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(dish)}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-sm transition-colors flex items-center space-x-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t.qrOrder.addDish}</span>
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-rose-400 font-medium">{t.qrOrder.itemUnavailable}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Desktop Cart Panel (Sticky) */}
        <div className="hidden lg:block space-y-4">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-sm sticky top-28">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center space-x-2 font-bold text-white text-base">
                <Receipt className="w-5 h-5 text-amber-500" />
                <span>{t.qrOrder.cartTitle}</span>
              </div>
              <span className="text-xs font-bold text-amber-400 bg-stone-950 px-2.5 py-1 rounded-xl border border-stone-800">
                {t.waiter.table} {selectedTable.number}
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="py-12 text-center text-xs text-stone-400">
                <Utensils className="w-8 h-8 text-stone-700 mx-auto mb-2" />
                <p className="font-medium text-stone-300">{t.qrOrder.cartEmpty}</p>
                <p className="text-[11px] text-stone-400 mt-1">
                  {t.qrOrder.cartEmptyDesc}
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="max-h-64 overflow-y-auto space-y-3 pr-1 divide-y divide-stone-800">
                  {cart.map((item) => (
                    <div key={item.menuItem.id} className="pt-3 first:pt-0">
                      <div className="flex items-start justify-between text-xs font-semibold">
                        <span className="text-white">
                          {item.menuItem.name[currentMarket] || item.menuItem.name['es-CO']}
                        </span>
                        <span className="font-mono text-amber-400 font-bold ml-2">
                          {formatCurrency(item.menuItem.price * item.quantity, item.menuItem.currency)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => updateQuantity(item.menuItem.id, -1)}
                            className="w-5 h-5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center justify-center text-xs"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="text-xs font-bold text-white px-1.5">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.menuItem.id, 1)}
                            className="w-5 h-5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center justify-center text-xs"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>

                        <input
                          type="text"
                          placeholder={t.qrOrder.notesPlaceholder}
                          value={item.notes}
                          onChange={(e) => updateItemNotes(item.menuItem.id, e.target.value)}
                          className="text-[11px] bg-stone-950 border border-stone-800 text-stone-300 rounded-lg px-2 py-1 focus:outline-none focus:border-amber-500 w-36"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Subtotal & Taxes */}
                <div className="pt-3 border-t border-stone-800 space-y-1.5 text-xs">
                  <div className="flex justify-between text-stone-400">
                    <span>{t.qrOrder.subtotal}:</span>
                    <span className="font-mono">{formatCurrency(clientSubtotal, activeBranch.commercialCurrency)}</span>
                  </div>
                  <div className="flex justify-between text-stone-400">
                    <span>{t.qrOrder.estimatedTax}:</span>
                    <span className="font-mono">{formatCurrency(clientTax, activeBranch.commercialCurrency)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-stone-800">
                    <span>{t.qrOrder.totalToPay}:</span>
                    <span className="font-mono text-amber-400">
                      {formatCurrency(clientTotal, activeBranch.commercialCurrency)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleSubmitOrder}
                  disabled={isSubmitting || cart.length === 0}
                  className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSubmitting ? t.qrOrder.submittingOrder : t.qrOrder.placeOrder}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Bar (When items are in cart) */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-4 inset-x-4 z-40">
          <button
            onClick={() => setShowMobileCart(true)}
            className="w-full py-3.5 px-5 bg-amber-500 text-stone-950 font-bold rounded-2xl shadow-2xl flex items-center justify-between text-sm active:scale-98 transition-transform"
          >
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-stone-950 text-amber-400 flex items-center justify-center text-xs font-extrabold">
                {totalItemCount}
              </span>
              <span>{t.qrOrder.viewCart}</span>
            </div>
            <div className="flex items-center space-x-1 font-mono text-base font-extrabold">
              <span>{formatCurrency(clientTotal, activeBranch.commercialCurrency)}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Mobile Cart Modal Drawer */}
      {showMobileCart && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border-t border-stone-700 rounded-t-3xl w-full p-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-amber-500" />
                <span>{t.qrOrder.cartTitle} - {t.waiter.table} {selectedTable.number}</span>
              </h3>
              <button
                onClick={() => setShowMobileCart(false)}
                className="p-1 rounded-full text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 divide-y divide-stone-800 max-h-60 overflow-y-auto">
              {cart.map((item) => (
                <div key={item.menuItem.id} className="pt-3 first:pt-0">
                  <div className="flex justify-between text-sm font-semibold text-white">
                    <span>{item.menuItem.name[currentMarket] || item.menuItem.name['es-CO']}</span>
                    <span className="font-mono text-amber-400 font-bold">
                      {formatCurrency(item.menuItem.price * item.quantity, item.menuItem.currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => updateQuantity(item.menuItem.id, -1)}
                        className="w-7 h-7 rounded-lg bg-stone-800 text-white flex items-center justify-center font-bold"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-bold text-white text-sm px-1">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.menuItem.id, 1)}
                        className="w-7 h-7 rounded-lg bg-stone-800 text-white flex items-center justify-center font-bold"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder={t.qrOrder.notesPlaceholder}
                      value={item.notes}
                      onChange={(e) => updateItemNotes(item.menuItem.id, e.target.value)}
                      className="text-xs bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-white w-40"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-stone-800 space-y-1.5 text-xs text-stone-300">
              <div className="flex justify-between">
                <span>{t.qrOrder.subtotal}:</span>
                <span className="font-mono">{formatCurrency(clientSubtotal, activeBranch.commercialCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t.qrOrder.tax}:</span>
                <span className="font-mono">{formatCurrency(clientTax, activeBranch.commercialCurrency)}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-stone-800">
                <span>{t.qrOrder.total}:</span>
                <span className="font-mono text-amber-400">
                  {formatCurrency(clientTotal, activeBranch.commercialCurrency)}
                </span>
              </div>
            </div>

            <button
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-amber-500 text-stone-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? t.qrOrder.submittingOrder : t.qrOrder.placeOrder}</span>
            </button>
          </div>
        </div>
      )}

      {/* Review Dialog Modal for Customers who ordered */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowReviewModal(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 pb-3 border-b border-stone-800">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Star className="w-5 h-5 fill-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">{t.reviews.leaveReview}</h3>
                <p className="text-xs text-stone-400">
                  {activeBranch.name} · {t.waiter.table} #{selectedTable.number}
                </p>
              </div>
            </div>

            {reviewSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="font-bold text-sm text-white">{reviewSuccess}</p>
                <p className="text-stone-300">{t.reviews.reviewSuccessDesc}</p>
              </div>
            ) : (
              <form onSubmit={handleSaveReviewFromOrder} className="space-y-4">
                {/* Rating Stars */}
                <div className="text-center bg-stone-950 p-3 rounded-2xl border border-stone-800">
                  <span className="text-xs font-semibold text-stone-400 block mb-2">
                    {t.reviews.yourRating}
                  </span>
                  <div className="flex justify-center space-x-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setReviewRating(star)}
                        className="p-1 hover:scale-115 transition-transform"
                      >
                        <Star
                          className={`w-7 h-7 ${
                            star <= reviewRating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-stone-700'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    {t.reviews.yourName}
                  </label>
                  <input
                    type="text"
                    value={reviewName}
                    placeholder={`${t.waiter.table} #${selectedTable.number}`}
                    onChange={(e) => setReviewName(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Comment */}
                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    {t.reviews.comment}
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder={t.reviews.commentPlaceholder}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-stone-800">
                  <button
                    type="button"
                    onClick={() => setShowReviewModal(false)}
                    className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow"
                  >
                    {t.reviews.submitReview}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
