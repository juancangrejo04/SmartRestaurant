// Core Domain and Distributed Systems Types for SmartRestaurant

export type MarketCode = 'es-CO' | 'es-MX' | 'en-US' | 'pt-BR' | 'ja-JP';

export type CurrencyCode = 'COP' | 'MXN' | 'USD' | 'BRL' | 'JPY';

export interface MarketConfig {
  id: MarketCode;
  country: string;
  languageName: string;
  locale: string;
  currency: CurrencyCode;
  currencySymbol: string;
  flag: string;
  defaultTimezone: string;
  decimalPlaces: number;
}

export type UserRole = 'OWNER' | 'ADMIN' | 'WAITER' | 'KITCHEN' | 'CUSTOMER';

export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  assignedBranchId?: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  commercialCurrency: CurrencyCode;
  openingTime: string; // e.g. "12:00"
  closingTime: string; // e.g. "23:00"
  maxCapacity: number;
}

export interface Restaurant {
  id: string;
  name: string;
  taxId: string;
  cuisineType: string;
  branches: Branch[];
}

export interface Table {
  id: string;
  tenantId: string;
  branchId: string;
  number: number;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  qrToken: string; // Non-guessable token for QR scans
  locationArea: 'TERRACE' | 'MAIN_HALL' | 'VIP_LOUNGE' | 'BAR';
}

export interface MenuCategory {
  id: string;
  tenantId: string;
  branchId?: string; // Optional if global
  name: Record<MarketCode, string>;
  description?: Record<MarketCode, string>;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  tenantId: string;
  categoryId: string;
  name: Record<MarketCode, string>;
  description: Record<MarketCode, string>;
  price: number; // Stored in the restaurant's commercial currency
  currency: CurrencyCode;
  isAvailable: boolean;
  preparationMinutes: number;
  imageUrl?: string;
  allergens?: string[];
}

export type ReservationStatus = 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED';

export interface Reservation {
  id: string;
  tenantId: string;
  branchId: string;
  tableId: string;
  tableNumber: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  partySize: number;
  status: ReservationStatus;
  specialRequests?: string;
  createdAt: string; // ISO UTC
  correlationId: string;
}

export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string; // e.g. "ORD-2026-1001"
  tenantId: string;
  branchId: string;
  tableId: string;
  tableNumber: number;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: CurrencyCode;
  status: OrderStatus;
  idempotencyKey: string;
  qrTokenUsed: string;
  customerName?: string;
  createdAt: string; // ISO UTC
  updatedAt: string; // ISO UTC
  statusHistory: Array<{
    status: OrderStatus;
    timestamp: string;
    note?: string;
    updatedByRole: UserRole;
  }>;
  correlationId: string;
}

export interface InAppNotification {
  id: string;
  tenantId: string;
  branchId?: string;
  title: string;
  message: string;
  type: 'ORDER' | 'RESERVATION' | 'KITCHEN' | 'SYSTEM' | 'RECOMMENDATION';
  read: boolean;
  timestamp: string;
  correlationId?: string;
}

export interface OperationalRecommendation {
  id: string;
  tenantId: string;
  branchId: string;
  title: string;
  explanation: string;
  justifyingData: Record<string, any>;
  generatedAt: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedAction: string;
  category: 'CAPACITY' | 'KITCHEN_SPEED' | 'POPULAR_DISH' | 'CONCURRENCY_RISK';
}

export interface Review {
  id: string;
  tenantId: string;
  branchId: string;
  customerName: string;
  rating: number; // 1 to 5
  comment: string;
  createdAt: string; // ISO UTC
  orderNumber?: string;
  dishName?: string;
  isVerifiedPurchase?: boolean;
}

export interface OutboxEvent {
  id: string;
  eventType: 
    | 'ReservationCreated'
    | 'ReservationCancelled'
    | 'OrderCreated'
    | 'OrderConfirmed'
    | 'OrderAcceptedByKitchen'
    | 'OrderStatusChanged'
    | 'OrderReady'
    | 'OrderDelivered'
    | 'ReviewCreated';
  aggregateType: 'Reservation' | 'Order' | 'Kitchen' | 'Review';
  aggregateId: string;
  tenantId: string;
  branchId: string;
  correlationId: string;
  schemaVersion: string;
  payload: Record<string, any>;
  createdAt: string;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  retryCount: number;
  lastError?: string;
}

export interface MicroserviceHealth {
  name: string;
  status: 'UP' | 'DEGRADED' | 'OFFLINE';
  port: number;
  latencyMs: number;
  version: string;
  description: string;
}
