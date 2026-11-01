import React, { createContext, useContext, useState, useEffect } from 'react';
import { MarketCode, CurrencyCode, MarketConfig } from '../types';
import { TranslationDictionary } from './types';
import { esCO } from './locales/es-CO';
import { esMX } from './locales/es-MX';
import { enUS } from './locales/en-US';
import { ptBR } from './locales/pt-BR';
import { jaJP } from './locales/ja-JP';

export const MARKETS: Record<MarketCode, MarketConfig> = {
  'es-CO': {
    id: 'es-CO',
    country: 'Colombia',
    languageName: 'Español (Colombia)',
    locale: 'es-CO',
    currency: 'COP',
    currencySymbol: '$',
    flag: '🇨🇴',
    defaultTimezone: 'America/Bogota',
    decimalPlaces: 0,
  },
  'es-MX': {
    id: 'es-MX',
    country: 'México',
    languageName: 'Español (México)',
    locale: 'es-MX',
    currency: 'MXN',
    currencySymbol: '$',
    flag: '🇲🇽',
    defaultTimezone: 'America/Mexico_City',
    decimalPlaces: 2,
  },
  'en-US': {
    id: 'en-US',
    country: 'United States',
    languageName: 'English (US)',
    locale: 'en-US',
    currency: 'USD',
    currencySymbol: '$',
    flag: '🇺🇸',
    defaultTimezone: 'America/New_York',
    decimalPlaces: 2,
  },
  'pt-BR': {
    id: 'pt-BR',
    country: 'Brasil',
    languageName: 'Português (Brasil)',
    locale: 'pt-BR',
    currency: 'BRL',
    currencySymbol: 'R$',
    flag: '🇧🇷',
    defaultTimezone: 'America/Sao_Paulo',
    decimalPlaces: 2,
  },
  'ja-JP': {
    id: 'ja-JP',
    country: '日本 (Japan)',
    languageName: '日本語 (Japanese)',
    locale: 'ja-JP',
    currency: 'JPY',
    currencySymbol: '¥',
    flag: '🇯🇵',
    defaultTimezone: 'Asia/Tokyo',
    decimalPlaces: 0,
  },
};

const TRANSLATIONS: Record<MarketCode, TranslationDictionary> = {
  'es-CO': esCO,
  'es-MX': esMX,
  'en-US': enUS,
  'pt-BR': ptBR,
  'ja-JP': jaJP,
};

interface I18nContextType {
  currentMarket: MarketCode;
  marketConfig: MarketConfig;
  setMarket: (market: MarketCode) => void;
  t: TranslationDictionary;
  formatCurrency: (amount: number, currencyCode?: CurrencyCode) => string;
  formatDate: (dateStr: string) => string;
  formatDateTime: (isoStr: string) => string;
  formatTime: (timeStr: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentMarket, setCurrentMarketState] = useState<MarketCode>(() => {
    const saved = localStorage.getItem('smartrestaurant_market');
    if (saved && saved in MARKETS) return saved as MarketCode;
    return 'es-CO'; // Default to Colombia
  });

  const setMarket = (market: MarketCode) => {
    setCurrentMarketState(market);
    localStorage.setItem('smartrestaurant_market', market);
  };

  const marketConfig = MARKETS[currentMarket];
  const t = TRANSLATIONS[currentMarket] || esCO;

  // Format currency respecting the item's business currency and the current locale for number display
  const formatCurrency = (amount: number, itemCurrency?: CurrencyCode): string => {
    const activeCurrency = itemCurrency || marketConfig.currency;
    const isZeroDecimal = activeCurrency === 'COP' || activeCurrency === 'JPY';

    try {
      return new Intl.NumberFormat(marketConfig.locale, {
        style: 'currency',
        currency: activeCurrency,
        minimumFractionDigits: isZeroDecimal ? 0 : 2,
        maximumFractionDigits: isZeroDecimal ? 0 : 2,
      }).format(amount);
    } catch {
      // Fallback
      return `${activeCurrency} ${amount.toLocaleString(marketConfig.locale)}`;
    }
  };

  const formatDate = (dateStr: string): string => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      if (!year || !month || !day) return dateStr;
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return new Intl.DateTimeFormat(marketConfig.locale, {
        dateStyle: 'medium',
        timeZone: marketConfig.defaultTimezone,
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (isoStr: string): string => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return new Intl.DateTimeFormat(marketConfig.locale, {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: marketConfig.defaultTimezone,
      }).format(d);
    } catch {
      return isoStr;
    }
  };

  const formatTime = (timeStr: string): string => {
    return timeStr; // HH:mm
  };

  return (
    <I18nContext.Provider
      value={{
        currentMarket,
        marketConfig,
        setMarket,
        t,
        formatCurrency,
        formatDate,
        formatDateTime,
        formatTime,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
