import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store } from '../domain/store';
import { Review } from '../types';
import { eventBus } from '../domain/events';
import {
  Star,
  MessageSquare,
  CheckCircle2,
  Filter,
  Plus,
  Search,
  Sparkles,
  Receipt,
  User,
  X,
  ThumbsUp,
  Award,
} from 'lucide-react';

interface ReviewsViewProps {
  initialOrderNumber?: string;
  onOpenOrderModal?: boolean;
}

export const ReviewsView: React.FC<ReviewsViewProps> = ({
  initialOrderNumber,
  onOpenOrderModal = false,
}) => {
  const { t } = useI18n();
  const activeBranch = store.getActiveBranch();
  const activeTenant = store.getActiveTenant();

  const [reviews, setReviews] = useState<Review[]>(() =>
    store.getReviews(activeBranch.id, activeTenant.id)
  );
  const [stats, setStats] = useState(() =>
    store.getReviewStats(activeBranch.id, activeTenant.id)
  );
  const [filterRating, setFilterRating] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(onOpenOrderModal);

  // New review form state
  const [customerName, setCustomerName] = useState('');
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber || '');
  const [dishName, setDishName] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Synchronize on branch change or real-time event
  useEffect(() => {
    const reload = () => {
      setReviews(store.getReviews(activeBranch.id, activeTenant.id));
      setStats(store.getReviewStats(activeBranch.id, activeTenant.id));
    };

    reload();
    const unsubscribe = eventBus.subscribeAll((event) => {
      if (event.aggregateType === 'Review' || event.eventType === 'ReviewCreated') {
        reload();
      }
    });

    return () => unsubscribe();
  }, [activeBranch.id, activeTenant.id]);

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!comment.trim()) {
      setFormError(t.common.error);
      return;
    }

    try {
      store.addReview({
        tenantId: activeTenant.id,
        branchId: activeBranch.id,
        customerName: customerName.trim() || t.roles.customer,
        rating,
        comment: comment.trim(),
        orderNumber: orderNumber.trim() || undefined,
        dishName: dishName.trim() || undefined,
        isVerifiedPurchase: !!orderNumber.trim(),
      });

      setSuccessMsg(t.reviews.reviewSuccess);
      setIsModalOpen(false);
      setComment('');
      setCustomerName('');
      setOrderNumber('');
      setDishName('');
      setRating(5);

      // Refresh list
      setReviews(store.getReviews(activeBranch.id, activeTenant.id));
      setStats(store.getReviewStats(activeBranch.id, activeTenant.id));
    } catch (err: any) {
      setFormError(err.message || t.common.error);
    }
  };

  const filteredReviews = reviews.filter((r) => {
    if (filterRating !== 'ALL' && Math.round(r.rating) !== filterRating) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.customerName.toLowerCase().includes(q);
      const matchComment = r.comment.toLowerCase().includes(q);
      const matchDish = r.dishName?.toLowerCase().includes(q);
      const matchOrder = r.orderNumber?.toLowerCase().includes(q);
      return matchName || matchComment || matchDish || matchOrder;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Title & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{t.reviews.title}</h1>
          </div>
          <p className="text-sm text-stone-400 mt-1">
            {activeBranch.name} · {t.reviews.subtitle}
          </p>
        </div>

        <button
          onClick={() => {
            setSuccessMsg(null);
            setIsModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-lg transition-all flex items-center space-x-2 self-start sm:self-auto hover:scale-102"
        >
          <Plus className="w-4 h-4" />
          <span>{t.reviews.writeReview}</span>
        </button>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-bold text-white">{successMsg}</p>
              <p className="text-[11px] text-emerald-400/90">{t.reviews.reviewSuccessDesc}</p>
            </div>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-stone-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Rating Summary Card & Star Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left Column: Big Overall Score */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 flex flex-col justify-between shadow-md">
          <div>
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider block">
              {t.reviews.averageRating}
            </span>
            <div className="mt-3 flex items-baseline space-x-3">
              <span className="text-5xl font-extrabold text-white font-mono">{stats.average}</span>
              <span className="text-stone-400 text-sm font-semibold">/ 5.0</span>
            </div>

            <div className="flex items-center space-x-1 mt-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${
                    star <= Math.round(stats.average)
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-stone-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
            <span>
              <strong className="text-white">{stats.count}</strong> {t.reviews.totalReviews}
            </span>
            <span className="flex items-center space-x-1 text-emerald-400 font-semibold">
              <Award className="w-3.5 h-3.5" />
              <span>100% {t.reviews.verifiedCustomer}</span>
            </span>
          </div>
        </div>

        {/* Right Columns (2 spans): Star Breakdown Progress Bars */}
        <div className="md:col-span-2 bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-md flex flex-col justify-center space-y-2.5">
          {[5, 4, 3, 2, 1].map((stars) => {
            const starCount = stats.breakdown[stars] || 0;
            const percentage = stats.count > 0 ? Math.round((starCount / stats.count) * 100) : 0;
            const isSelected = filterRating === stars;

            return (
              <div
                key={stars}
                onClick={() => setFilterRating(isSelected ? 'ALL' : stars)}
                className={`flex items-center space-x-3 text-xs p-1.5 rounded-xl cursor-pointer transition-colors ${
                  isSelected ? 'bg-amber-500/15 border border-amber-500/40' : 'hover:bg-stone-800/60'
                }`}
              >
                <div className="flex items-center space-x-1 w-14 flex-shrink-0">
                  <span className="font-bold text-white">{stars}</span>
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                </div>

                <div className="flex-1 bg-stone-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <div className="w-16 text-right flex-shrink-0 text-stone-400 font-mono text-[11px]">
                  <span>{starCount}</span>
                  <span className="text-stone-400 ml-1">({percentage}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-stone-900 p-2.5 rounded-2xl border border-stone-800">
        {/* Star Rating Filters */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setFilterRating('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterRating === 'ALL'
                ? 'bg-amber-500 text-stone-950 font-bold'
                : 'text-stone-400 hover:text-white bg-stone-950/60'
            }`}
          >
            {t.reviews.allRatings} ({stats.count})
          </button>
          {[5, 4, 3, 2, 1].map((stars) => (
            <button
              key={stars}
              onClick={() => setFilterRating(stars)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all ${
                filterRating === stars
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-400 hover:text-white bg-stone-950/60'
              }`}
            >
              <span>{stars}</span>
              <Star className="w-3 h-3 fill-current" />
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t.common.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-56 pl-8 pr-3 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Reviews Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredReviews.map((rev) => (
          <div
            key={rev.id}
            className="bg-stone-900 border border-stone-800 hover:border-stone-700 rounded-3xl p-5 shadow-sm transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              {/* Review Card Header: User & Stars */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm">
                    {rev.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm flex items-center space-x-1.5">
                      <span>{rev.customerName}</span>
                      {rev.isVerifiedPurchase && (
                        <span
                          className="inline-flex items-center space-x-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          title={t.reviews.verifiedCustomer}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{t.reviews.verifiedCustomer}</span>
                        </span>
                      )}
                    </h3>
                    <span className="text-[11px] text-stone-500">
                      {new Date(rev.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Stars Rating Badge */}
                <div className="flex items-center space-x-0.5 bg-stone-950 px-2 py-1 rounded-xl border border-stone-800">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-stone-800'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Tag for order or dish */}
              {(rev.orderNumber || rev.dishName) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {rev.orderNumber && (
                    <span className="inline-flex items-center space-x-1 text-[10px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-lg">
                      <Receipt className="w-3 h-3" />
                      <span>{t.customerOrders.order} #{rev.orderNumber}</span>
                    </span>
                  )}
                  {rev.dishName && (
                    <span className="text-[10px] text-stone-400 bg-stone-950 px-2 py-0.5 rounded-lg border border-stone-800">
                      {rev.dishName}
                    </span>
                  )}
                </div>
              )}

              {/* Comment Content */}
              <p className="mt-3 text-xs text-stone-300 leading-relaxed italic">
                "{rev.comment}"
              </p>
            </div>

            <div className="pt-2 border-t border-stone-800/60 flex items-center justify-between text-[11px] text-stone-500">
              <span>{activeBranch.city}, {activeBranch.country}</span>
              <span className="flex items-center space-x-1 text-stone-400">
                <ThumbsUp className="w-3 h-3 text-stone-500" />
                <span>Útil</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {filteredReviews.length === 0 && (
        <div className="py-16 text-center text-stone-400 bg-stone-900 border border-stone-800 rounded-3xl p-8 space-y-3">
          <MessageSquare className="w-12 h-12 text-stone-600 mx-auto mb-2" />
          <h3 className="text-base font-bold text-white">{t.reviews.noReviewsYet}</h3>
          <p className="text-xs text-stone-400 max-w-md mx-auto">
            {t.reviews.noReviewsYetDesc}
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-3 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md transition-colors inline-flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t.reviews.leaveReview}</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ESCRIBIR RESEÑA                                    */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 pb-3 border-b border-stone-800">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">{t.reviews.writeReview}</h2>
                <p className="text-xs text-stone-400">
                  {activeBranch.name} · {activeBranch.city}
                </p>
              </div>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitReview} className="space-y-4">
              {/* Star Rating Picker */}
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 text-center">
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                  {t.reviews.yourRating}
                </label>
                <div className="flex items-center justify-center space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 transition-transform hover:scale-125 focus:outline-none"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          star <= (hoverRating || rating)
                            ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                            : 'text-stone-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <div className="text-xs font-semibold text-amber-400 mt-2">
                  {rating === 5 && '★★★★★ Excelente'}
                  {rating === 4 && '★★★★☆ Muy Bueno'}
                  {rating === 3 && '★★★☆☆ Bueno'}
                  {rating === 2 && '★★☆☆☆ Regular'}
                  {rating === 1 && '★☆☆☆☆ Insatisfecho'}
                </div>
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1">
                  {t.reviews.yourName}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t.reviews.namePlaceholder}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Order Reference (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    {t.reviews.orderReference}
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. ORD-2026-1001"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    Plato favorito probado (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Ajiaco, Ribeye, Tacos..."
                    value={dishName}
                    onChange={(e) => setDishName(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1">
                  {t.reviews.comment}
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder={t.reviews.commentPlaceholder}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold transition-colors"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md transition-colors"
                >
                  {t.reviews.submitReview}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
