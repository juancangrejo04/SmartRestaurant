import React, { useState } from 'react';
import { useI18n } from '../i18n/i18nContext';
import { store, STAFF_ACCOUNTS, StaffAccount } from '../domain/store';
import { UserRole } from '../types';
import {
  Lock,
  Mail,
  KeyRound,
  ShieldCheck,
  User,
  ChefHat,
  Crown,
  Briefcase,
  X,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (role: UserRole) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const [isLoading, setIsLoading] = useState(false);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const result = await store.loginStaff(email, password);
      if (result.success && result.user) {
        onLoginSuccess(result.user.role);
        onClose();
      } else {
        setErrorMsg(result.error || t.login.invalidCredentials);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de autenticación con Supabase Auth.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (account: StaffAccount) => {
    setEmail(account.email);
    setPassword('');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative text-stone-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-stone-400 hover:text-white p-1 rounded-full hover:bg-stone-800 transition-colors"
          title={t.login.close}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              {t.login.staffAccessTitle}
            </h2>
            <p className="text-xs text-stone-400">
              {t.login.staffAccessSubtitle}
            </p>
          </div>
        </div>

        {/* Customer notice */}
        <div className="my-4 p-3 bg-stone-950/60 border border-stone-800 rounded-xl text-xs text-stone-300 flex items-start space-x-2.5">
          <span className="text-amber-500 text-base leading-none">💡</span>
          <p className="leading-relaxed">
            {t.login.customerNotice}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Manual Login Form */}
        <form onSubmit={handleManualLogin} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1">
              {t.login.email}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                placeholder="staff@smartrestaurant.co"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 text-white text-xs rounded-xl pl-10 pr-3.5 py-2.5 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1">
              {t.login.password}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 text-white text-xs rounded-xl pl-10 pr-3.5 py-2.5 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md transition-colors flex items-center justify-center space-x-2"
          >
            <span>{t.login.signIn}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* 1-Click Demo Accounts for Easy Testing */}
        <div className="mt-6 pt-5 border-t border-stone-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-3">
            {t.login.quickAccess}
          </span>

          <div className="grid grid-cols-2 gap-2">
            {STAFF_ACCOUNTS.map((acc) => {
              const icon =
                acc.role === 'OWNER' ? (
                  <Crown className="w-4 h-4 text-amber-400" />
                ) : acc.role === 'ADMIN' ? (
                  <Briefcase className="w-4 h-4 text-sky-400" />
                ) : acc.role === 'WAITER' ? (
                  <User className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ChefHat className="w-4 h-4 text-rose-400" />
                );

              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => handleQuickLogin(acc)}
                  className="p-2.5 bg-stone-950/80 hover:bg-stone-800 border border-stone-800/80 hover:border-stone-700 rounded-xl text-left transition-all flex items-start space-x-2.5 group"
                >
                  <div className="mt-0.5">{icon}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-stone-200 group-hover:text-amber-400 truncate">
                      {acc.name}
                    </div>
                    <div className="text-[10px] text-stone-400 font-medium">
                      {acc.jobTitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
