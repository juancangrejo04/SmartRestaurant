import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import { Order } from '../types';
import { eventBus } from '../domain/events';
import {
  Clock,
  CheckCircle2,
  Utensils,
  Receipt,
  ChefHat,
  Bell,
  ArrowRight,
  Star,
  X,
} from 'lucide-react';

interface CustomerOrdersViewProps {
  onNavigateToMenu: () => void;
  onNavigateToReviews?: () => void;
}

export const CustomerOrdersView: React.FC<CustomerOrdersViewProps> = ({
  onNavigateToMenu,
  onNavigateToReviews,
}) => {
  const { t, formatCurrency } = useI18n();
  const activeBranch = store.getActiveBranch();
  const activeTenant = store.getActiveTenant();
  const [orders, setOrders] = useState<Order[]>(() => store.getOrders(activeBranch.id));

  // Review modal state
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewName, setReviewName] = useState<string>('');
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  useEffect(() => {
    const reload = () => setOrders(store.getOrders(activeBranch.id));
    const unsubscribe = eventBus.subscribeAll(() => reload());
    return () => unsubscribe();
  }, [activeBranch.id]);

  const activeOrders = orders.filter((o) => o.status !== 'CANCELLED');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{t.customerOrders.title}</h1>
        <p className="text-sm text-stone-400 mt-1">
          {t.customerOrders.subtitle} · {activeBranch.name}
        </p>
      </div>

      {activeOrders.length === 0 ? (
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-10 text-center text-stone-400 space-y-3">
          <Utensils className="w-10 h-10 text-stone-600 mx-auto mb-2" />
          <h3 className="text-base font-bold text-white">{t.customerOrders.noActiveOrders}</h3>
          <p className="text-xs text-stone-400 max-w-md mx-auto">
            {t.customerOrders.noActiveOrdersDesc}
          </p>
          <button
            onClick={onNavigateToMenu}
            className="mt-3 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md transition-colors inline-flex items-center space-x-2"
          >
            <span>{t.customerOrders.viewMenuAndOrder}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {activeOrders.map((ord) => (
            <div
              key={ord.id}
              className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-md space-y-5"
            >
              {/* Order Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-stone-800 gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-base text-white">
                      {t.customerOrders.order} #{ord.orderNumber}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-stone-950 text-amber-400 border border-stone-800 text-xs font-bold">
                      {t.customerOrders.table} {ord.tableNumber}
                    </span>
                  </div>
                  <span className="text-xs text-stone-400 mt-0.5 block">
                    {t.customerOrders.sentAt} {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                      ord.status === 'RECEIVED'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : ord.status === 'PREPARING'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse'
                        : ord.status === 'READY'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : ord.status === 'DELIVERED'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-stone-800 text-stone-300'
                    }`}
                  >
                    {t.orderStatuses[ord.status.toLowerCase() as keyof typeof t.orderStatuses] || ord.status}
                  </span>
                </div>
              </div>

              {/* Stepper Progress */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  { key: 'RECEIVED', label: `1. ${t.orderStatuses.received}`, desc: t.kitchen.waitingOrders },
                  { key: 'PREPARING', label: `2. ${t.orderStatuses.preparing}`, desc: t.kitchen.inPrepOrders },
                  { key: 'READY', label: `3. ${t.orderStatuses.ready}`, desc: t.kitchen.readyOrders },
                  { key: 'DELIVERED', label: `4. ${t.orderStatuses.delivered}`, desc: t.kitchen.deliveredOrders },
                ].map((step, idx) => {
                  const seq = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED'];
                  const currIdx = seq.indexOf(ord.status);
                  const isPassed = currIdx >= idx;
                  const isCurrent = currIdx === idx;

                  return (
                    <div
                      key={step.key}
                      className={`p-3 rounded-2xl transition-all ${
                        isCurrent
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                          : isPassed
                          ? 'text-emerald-400 bg-stone-950/60 font-semibold'
                          : 'text-stone-600 bg-stone-950/30'
                      }`}
                    >
                      <div className="text-xs">{step.label}</div>
                      <div className="text-[10px] text-stone-400 hidden sm:block mt-0.5">
                        {step.desc}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Items Breakdown */}
              <div className="bg-stone-950/70 p-4 rounded-2xl border border-stone-800 space-y-2">
                <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
                  {t.qrOrder.cartTitle}
                </div>
                {ord.items.map((it) => (
                  <div key={it.id} className="flex justify-between text-xs text-stone-200">
                    <span>
                      <strong className="text-amber-400 mr-2">{it.quantity}x</strong>
                      {it.name}
                      {it.notes && <span className="text-stone-400 italic text-[11px] block ml-6">"{it.notes}"</span>}
                    </span>
                    <span className="font-mono text-stone-300">
                      {formatCurrency(it.subtotal, ord.currency)}
                    </span>
                  </div>
                ))}

                <div className="pt-3 border-t border-stone-800 flex justify-between text-sm font-bold text-white">
                  <span>{t.qrOrder.total}:</span>
                  <span className="font-mono text-amber-400">
                    {formatCurrency(ord.total, ord.currency)}
                  </span>
                </div>
              </div>

              {/* Review Button */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setReviewOrder(ord);
                    setReviewSuccess(null);
                    setReviewRating(5);
                    setReviewComment('');
                    setReviewName(ord.customerName || `${t.waiter.table} #${ord.tableNumber}`);
                  }}
                  className="w-full py-2.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold transition-all flex items-center justify-center space-x-2"
                >
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{t.reviews.leaveReview} ({t.customerOrders.order} #{ord.orderNumber})</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal for Selected Order */}
      {reviewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setReviewOrder(null)}
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
                  {t.customerOrders.order} #{reviewOrder.orderNumber} · {t.waiter.table} #{reviewOrder.tableNumber}
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reviewComment.trim()) return;
                  store.addReview({
                    tenantId: activeTenant.id,
                    branchId: activeBranch.id,
                    customerName: reviewName.trim() || reviewOrder.customerName || `${t.waiter.table} #${reviewOrder.tableNumber}`,
                    rating: reviewRating,
                    comment: reviewComment.trim(),
                    orderNumber: reviewOrder.orderNumber,
                    dishName: reviewOrder.items[0]?.name,
                    isVerifiedPurchase: true,
                  });
                  setReviewSuccess(t.reviews.reviewSuccess);
                  setTimeout(() => {
                    setReviewOrder(null);
                    setReviewComment('');
                    if (onNavigateToReviews) onNavigateToReviews();
                  }, 1200);
                }}
                className="space-y-4"
              >
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
                    placeholder="Tu nombre"
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
                    onClick={() => setReviewOrder(null)}
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
