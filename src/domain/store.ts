// Core Distributed Domain Store with Multi-tenant Isolation and Concurrency Control
import {
  Restaurant,
  Branch,
  Table,
  MenuCategory,
  MenuItem,
  Reservation,
  Order,
  User,
  OperationalRecommendation,
  InAppNotification,
  OutboxEvent,
  OrderStatus,
  UserRole,
  CurrencyCode,
  MarketCode,
  Review,
} from '../types';
import { eventBus, generateCorrelationId } from './events';

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  tenantId: string;
  avatarUrl?: string;
  assignedBranchId?: string;
  jobTitle: string;
}

export const STAFF_ACCOUNTS: StaffAccount[] = [
  {
    id: 'staff-owner-01',
    name: 'Carlos Mendoza',
    email: 'carlos@smartrestaurant.co',
    password: 'propietario123',
    role: 'OWNER',
    tenantId: 'rest-col-01',
    jobTitle: 'Dueño y Fundador',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'staff-admin-01',
    name: 'Valeria Gómez',
    email: 'valeria@smartrestaurant.co',
    password: 'admin123',
    role: 'ADMIN',
    tenantId: 'rest-col-01',
    assignedBranchId: 'branch-col-bog',
    jobTitle: 'Gerente de Operaciones',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'staff-waiter-01',
    name: 'Mateo Restrepo',
    email: 'mateo@smartrestaurant.co',
    password: 'mesero123',
    role: 'WAITER',
    tenantId: 'rest-col-01',
    assignedBranchId: 'branch-col-bog',
    jobTitle: 'Capitán de Meseros',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'staff-kitchen-01',
    name: 'Chef Andrés Parra',
    email: 'cocina@smartrestaurant.co',
    password: 'cocina123',
    role: 'KITCHEN',
    tenantId: 'rest-col-01',
    assignedBranchId: 'branch-col-bog',
    jobTitle: 'Chef Ejecutivo de Cocina',
    avatarUrl: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=200&q=80',
  },
];

export const GUEST_CUSTOMER: User = {
  id: 'guest-customer-session',
  tenantId: 'rest-col-01',
  name: 'Cliente Invitado',
  email: 'comensal@mesa.app',
  role: 'CUSTOMER',
};

// 2 Sucursales por cada uno de los 5 países (10 sucursales en total)
export const INITIAL_RESTAURANTS: Restaurant[] = [
  {
    id: 'rest-col-01',
    name: 'Andrés Restaurante & Asador',
    taxId: 'NIT 900.234.567-1',
    cuisineType: 'Gastronomía Colombiana Contemporánea',
    branches: [
      {
        id: 'branch-col-bog',
        tenantId: 'rest-col-01',
        name: 'Sede Bogotá - Zona Rosa',
        address: 'Calle 82 # 12-25',
        city: 'Bogotá',
        country: 'Colombia',
        timezone: 'America/Bogota',
        commercialCurrency: 'COP',
        openingTime: '12:00',
        closingTime: '23:30',
        maxCapacity: 80,
      },
      {
        id: 'branch-col-med',
        tenantId: 'rest-col-01',
        name: 'Sede Medellín - El Poblado',
        address: 'Carrera 35 # 8A-42',
        city: 'Medellín',
        country: 'Colombia',
        timezone: 'America/Bogota',
        commercialCurrency: 'COP',
        openingTime: '12:30',
        closingTime: '23:00',
        maxCapacity: 60,
      },
    ],
  },
  {
    id: 'rest-mex-02',
    name: 'Taquería y Cantina Los Aluxes',
    taxId: 'RFC ALU980415-K92',
    cuisineType: 'Cocina Mexicana de Tradición',
    branches: [
      {
        id: 'branch-mex-cdmx',
        tenantId: 'rest-mex-02',
        name: 'Sucursal CDMX - Polanco',
        address: 'Av. Presidente Masaryk 310',
        city: 'Ciudad de México',
        country: 'México',
        timezone: 'America/Mexico_City',
        commercialCurrency: 'MXN',
        openingTime: '13:00',
        closingTime: '01:00',
        maxCapacity: 90,
      },
      {
        id: 'branch-mex-gdl',
        tenantId: 'rest-mex-02',
        name: 'Sucursal Guadalajara - Zapopan',
        address: 'Av. Patria 1890',
        city: 'Guadalajara',
        country: 'México',
        timezone: 'America/Mexico_City',
        commercialCurrency: 'MXN',
        openingTime: '13:00',
        closingTime: '00:00',
        maxCapacity: 75,
      },
    ],
  },
  {
    id: 'rest-usa-03',
    name: 'Manhattan Prime Steakhouse',
    taxId: 'EIN 13-9874521',
    cuisineType: 'New York Classic Steakhouse',
    branches: [
      {
        id: 'branch-usa-soho',
        tenantId: 'rest-usa-03',
        name: 'SoHo Flagship - Manhattan',
        address: '482 Broome Street',
        city: 'New York',
        country: 'United States',
        timezone: 'America/New_York',
        commercialCurrency: 'USD',
        openingTime: '17:00',
        closingTime: '23:30',
        maxCapacity: 110,
      },
      {
        id: 'branch-usa-miami',
        tenantId: 'rest-usa-03',
        name: 'Brickell Financial - Miami',
        address: '1100 Brickell Bay Drive',
        city: 'Miami',
        country: 'United States',
        timezone: 'America/New_York',
        commercialCurrency: 'USD',
        openingTime: '17:00',
        closingTime: '00:00',
        maxCapacity: 95,
      },
    ],
  },
  {
    id: 'rest-bra-04',
    name: 'Fogo & Sabor Churrascaria',
    taxId: 'CNPJ 24.382.910/0001-55',
    cuisineType: 'Churrasco Gaúcho Tradicional',
    branches: [
      {
        id: 'branch-bra-sp',
        tenantId: 'rest-bra-04',
        name: 'Unidade São Paulo - Itaim Bibi',
        address: 'Rua Joaquim Floriano, 466',
        city: 'São Paulo',
        country: 'Brasil',
        timezone: 'America/Sao_Paulo',
        commercialCurrency: 'BRL',
        openingTime: '12:00',
        closingTime: '23:00',
        maxCapacity: 100,
      },
      {
        id: 'branch-bra-rio',
        tenantId: 'rest-bra-04',
        name: 'Unidade Rio de Janeiro - Copacabana',
        address: 'Av. Atlântica 2100',
        city: 'Rio de Janeiro',
        country: 'Brasil',
        timezone: 'America/Sao_Paulo',
        commercialCurrency: 'BRL',
        openingTime: '12:00',
        closingTime: '23:30',
        maxCapacity: 85,
      },
    ],
  },
  {
    id: 'rest-jpn-05',
    name: '割烹 銀座 桜 (Kappo Sakura Ginza)',
    taxId: '法人番号 7010401056789',
    cuisineType: '伝統日本料理・会席 (Kaiseki & Edomae)',
    branches: [
      {
        id: 'branch-jpn-ginza',
        tenantId: 'rest-jpn-05',
        name: '東京 銀座本店 (Tokyo Ginza)',
        address: '東京都中央区銀座 6-10-1',
        city: 'Tokyo',
        country: '日本 (Japan)',
        timezone: 'Asia/Tokyo',
        commercialCurrency: 'JPY',
        openingTime: '11:30',
        closingTime: '22:00',
        maxCapacity: 45,
      },
      {
        id: 'branch-jpn-kyoto',
        tenantId: 'rest-jpn-05',
        name: '京都 祇園別邸 (Kyoto Gion)',
        address: '京都府京都市東山区祇園町南側 570',
        city: 'Kyoto',
        country: '日本 (Japan)',
        timezone: 'Asia/Tokyo',
        commercialCurrency: 'JPY',
        openingTime: '12:00',
        closingTime: '21:30',
        maxCapacity: 35,
      },
    ],
  },
];

export const INITIAL_TABLES: Table[] = [
  // Bogotá tables
  { id: 'tbl-col-01', tenantId: 'rest-col-01', branchId: 'branch-col-bog', number: 1, capacity: 2, status: 'AVAILABLE', qrToken: 'qr-bog-tbl-01-token884', locationArea: 'MAIN_HALL' },
  { id: 'tbl-col-02', tenantId: 'rest-col-01', branchId: 'branch-col-bog', number: 2, capacity: 4, status: 'OCCUPIED', qrToken: 'qr-bog-tbl-02-token192', locationArea: 'MAIN_HALL' },
  { id: 'tbl-col-03', tenantId: 'rest-col-01', branchId: 'branch-col-bog', number: 3, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-bog-tbl-03-token503', locationArea: 'TERRACE' },
  { id: 'tbl-col-04', tenantId: 'rest-col-01', branchId: 'branch-col-bog', number: 4, capacity: 6, status: 'RESERVED', qrToken: 'qr-bog-tbl-04-token377', locationArea: 'VIP_LOUNGE' },
  { id: 'tbl-col-05', tenantId: 'rest-col-01', branchId: 'branch-col-bog', number: 5, capacity: 8, status: 'AVAILABLE', qrToken: 'qr-bog-tbl-05-token621', locationArea: 'MAIN_HALL' },

  // Medellín tables
  { id: 'tbl-med-01', tenantId: 'rest-col-01', branchId: 'branch-col-med', number: 1, capacity: 2, status: 'AVAILABLE', qrToken: 'qr-med-tbl-01-tok771', locationArea: 'TERRACE' },
  { id: 'tbl-med-02', tenantId: 'rest-col-01', branchId: 'branch-col-med', number: 2, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-med-tbl-02-tok772', locationArea: 'MAIN_HALL' },

  // Mexico CDMX tables
  { id: 'tbl-mex-01', tenantId: 'rest-mex-02', branchId: 'branch-mex-cdmx', number: 1, capacity: 2, status: 'AVAILABLE', qrToken: 'qr-mex-tbl-01-token441', locationArea: 'TERRACE' },
  { id: 'tbl-mex-02', tenantId: 'rest-mex-02', branchId: 'branch-mex-cdmx', number: 2, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-mex-tbl-02-token782', locationArea: 'MAIN_HALL' },
  { id: 'tbl-mex-03', tenantId: 'rest-mex-02', branchId: 'branch-mex-cdmx', number: 3, capacity: 6, status: 'OCCUPIED', qrToken: 'qr-mex-tbl-03-token993', locationArea: 'MAIN_HALL' },

  // Mexico Guadalajara tables
  { id: 'tbl-gdl-01', tenantId: 'rest-mex-02', branchId: 'branch-mex-gdl', number: 1, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-gdl-tbl-01-tok881', locationArea: 'MAIN_HALL' },
  { id: 'tbl-gdl-02', tenantId: 'rest-mex-02', branchId: 'branch-mex-gdl', number: 2, capacity: 6, status: 'AVAILABLE', qrToken: 'qr-gdl-tbl-02-tok882', locationArea: 'TERRACE' },

  // USA SoHo tables
  { id: 'tbl-usa-01', tenantId: 'rest-usa-03', branchId: 'branch-usa-soho', number: 1, capacity: 2, status: 'AVAILABLE', qrToken: 'qr-usa-tbl-01-token112', locationArea: 'BAR' },
  { id: 'tbl-usa-02', tenantId: 'rest-usa-03', branchId: 'branch-usa-soho', number: 2, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-usa-tbl-02-token223', locationArea: 'MAIN_HALL' },

  // USA Miami tables
  { id: 'tbl-mia-01', tenantId: 'rest-usa-03', branchId: 'branch-usa-miami', number: 1, capacity: 2, status: 'AVAILABLE', qrToken: 'qr-mia-tbl-01-tok991', locationArea: 'TERRACE' },
  { id: 'tbl-mia-02', tenantId: 'rest-usa-03', branchId: 'branch-usa-miami', number: 2, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-mia-tbl-02-tok992', locationArea: 'MAIN_HALL' },

  // Brasil SP tables
  { id: 'tbl-bra-01', tenantId: 'rest-bra-04', branchId: 'branch-bra-sp', number: 1, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-bra-tbl-01-token334', locationArea: 'MAIN_HALL' },
  { id: 'tbl-bra-02', tenantId: 'rest-bra-04', branchId: 'branch-bra-sp', number: 2, capacity: 6, status: 'AVAILABLE', qrToken: 'qr-bra-tbl-02-tok335', locationArea: 'MAIN_HALL' },

  // Brasil Rio tables
  { id: 'tbl-rio-01', tenantId: 'rest-bra-04', branchId: 'branch-bra-rio', number: 1, capacity: 2, status: 'AVAILABLE', qrToken: 'qr-rio-tbl-01-tok336', locationArea: 'TERRACE' },
  { id: 'tbl-rio-02', tenantId: 'rest-bra-04', branchId: 'branch-bra-rio', number: 2, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-rio-tbl-02-tok337', locationArea: 'MAIN_HALL' },

  // Japan Ginza tables
  { id: 'tbl-jpn-01', tenantId: 'rest-jpn-05', branchId: 'branch-jpn-ginza', number: 1, capacity: 2, status: 'AVAILABLE', qrToken: 'qr-jpn-tbl-01-token445', locationArea: 'VIP_LOUNGE' },
  { id: 'tbl-jpn-02', tenantId: 'rest-jpn-05', branchId: 'branch-jpn-ginza', number: 2, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-jpn-tbl-02-token556', locationArea: 'MAIN_HALL' },

  // Japan Kyoto tables
  { id: 'tbl-kyo-01', tenantId: 'rest-jpn-05', branchId: 'branch-jpn-kyoto', number: 1, capacity: 2, status: 'AVAILABLE', qrToken: 'qr-kyo-tbl-01-tok557', locationArea: 'VIP_LOUNGE' },
  { id: 'tbl-kyo-02', tenantId: 'rest-jpn-05', branchId: 'branch-jpn-kyoto', number: 2, capacity: 4, status: 'AVAILABLE', qrToken: 'qr-kyo-tbl-02-tok558', locationArea: 'MAIN_HALL' },
];

export const INITIAL_CATEGORIES: MenuCategory[] = [
  {
    id: 'cat-col-01',
    tenantId: 'rest-col-01',
    name: {
      'es-CO': 'Platos Fuertes Tradicionales',
      'es-MX': 'Platillos Fuertes',
      'en-US': 'Signature Main Entrees',
      'pt-BR': 'Pratos Principais Típicos',
      'ja-JP': '自慢のメイン料理',
    },
    sortOrder: 1,
  },
  {
    id: 'cat-col-02',
    tenantId: 'rest-col-01',
    name: {
      'es-CO': 'Entradas y Piqueos',
      'es-MX': 'Entradas y Botanas',
      'en-US': 'Appetizers & Starters',
      'pt-BR': 'Entradas e Petiscos',
      'ja-JP': '前菜・一品料理',
    },
    sortOrder: 2,
  },
  {
    id: 'cat-col-03',
    tenantId: 'rest-col-01',
    name: {
      'es-CO': 'Bebidas y Cocteles',
      'es-MX': 'Bebidas y Coctelería',
      'en-US': 'Beverages & Cocktails',
      'pt-BR': 'Bebidas e Coquetéis',
      'ja-JP': 'お飲み物・カクテル',
    },
    sortOrder: 3,
  },
  {
    id: 'cat-mex-01',
    tenantId: 'rest-mex-02',
    name: {
      'es-CO': 'Tacos y Especialidades',
      'es-MX': 'Tacos al Carbón y Antojitos',
      'en-US': 'Tacos & Regional Specialties',
      'pt-BR': 'Tacos e Especialidades',
      'ja-JP': '特選タコス・伝統郷土料理',
    },
    sortOrder: 1,
  },
  {
    id: 'cat-usa-01',
    tenantId: 'rest-usa-03',
    name: {
      'es-CO': 'Cortes Premium',
      'es-MX': 'Cortes Prime a la Leña',
      'en-US': 'Prime Dry-Aged Steaks',
      'pt-BR': 'Cortes Nobres Prime',
      'ja-JP': 'プライム熟成ステーキ',
    },
    sortOrder: 1,
  },
  {
    id: 'cat-bra-01',
    tenantId: 'rest-bra-04',
    name: {
      'es-CO': 'Carnes al Rodizio',
      'es-MX': 'Cortes Rodizio Brasileños',
      'en-US': 'Rodizio Brazilian Meats',
      'pt-BR': 'Carnes Nobres no Espeto',
      'ja-JP': '伝統シュラスコ肉料理',
    },
    sortOrder: 1,
  },
  {
    id: 'cat-jpn-01',
    tenantId: 'rest-jpn-05',
    name: {
      'es-CO': 'Sushi y Kaiseki de Temporada',
      'es-MX': 'Sushi y Kaiseki de Temporada',
      'en-US': 'Seasonal Omakase & Kaiseki',
      'pt-BR': 'Sushi e Kaiseki da Estação',
      'ja-JP': '季節の会席・極上握り寿司',
    },
    sortOrder: 1,
  },
];

// Platos con FOTOGRAFÍAS REALES de alta calidad (sin caricaturas)
export const INITIAL_MENU_ITEMS: MenuItem[] = [
  // Colombia items (COP)
  {
    id: 'item-col-01',
    tenantId: 'rest-col-01',
    categoryId: 'cat-col-01',
    name: {
      'es-CO': 'Bandeja Paisa Tradicional',
      'es-MX': 'Bandeja Paisa Colombiana',
      'en-US': 'Traditional Paisa Platter',
      'pt-BR': 'Bandeja Paisa Colombiana',
      'ja-JP': '伝統のバンデハ・パイサ（特製盛り合わせ）',
    },
    description: {
      'es-CO': 'Chicharrón crujiente, carne molida sazonada, frijoles antioqueños, arroz, huevo frito, tajada de plátano maduro, arepa y aguacate fresco.',
      'es-MX': 'Chicharrón crujiente, frijoles estofados, carne molida, huevo estrellado, plátano macho y aguacate.',
      'en-US': 'Crispy pork belly, savory ground beef, stewed red beans, rice, fried egg, sweet plantain, arepa, and avocado.',
      'pt-BR': 'Torresmo crocante, carne moída temperada, feijão típico, arroz, ovo frito, banana madura frita e abacate.',
      'ja-JP': 'カリカリの豚バラ揚げ、香ばしい牛肉、特製煮豆、目玉焼き、揚げバナナ、アボカドを添えたコロンビア名物プレート。',
    },
    price: 48000,
    currency: 'COP',
    isAvailable: true,
    preparationMinutes: 18,
    allergens: ['Huevo'],
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'item-col-02',
    tenantId: 'rest-col-01',
    categoryId: 'cat-col-01',
    name: {
      'es-CO': 'Ajiaco Santafereño con Alcaparras',
      'es-MX': 'Sopa Ajiaco de Bogotá',
      'en-US': 'Bogota Classic Ajiaco Soup',
      'pt-BR': 'Sopa Ajiaco Tradicional',
      'ja-JP': 'ボゴタ伝統アヒアコ（3種のジャガイモと鶏肉の煮込みスープ）',
    },
    description: {
      'es-CO': 'Sopa espesa de tres tipos de papa con guascas, pechuga de pollo desmechada, mazorca tierna, crema de leche fresca y alcaparras.',
      'es-MX': 'Sopa tradicional de tres papas con pollo desmenuzado, elote tierno, crema y alcaparras.',
      'en-US': 'Rich potato soup infused with guasca herb, tender chicken breast, sweet corn, heavy cream, and capers.',
      'pt-BR': 'Sopa cremosa de três tipos de batata com frango desfiado, milho doce, creme de leite fresco e alcaparras.',
      'ja-JP': '特産ハーブと3種のポテト、柔らかく煮込んだ鶏肉、トウモロコシの濃厚スープ。ケッパーと生クリームを添えて。',
    },
    price: 42000,
    currency: 'COP',
    isAvailable: true,
    preparationMinutes: 15,
    allergens: ['Lácteos'],
    imageUrl: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'item-col-03',
    tenantId: 'rest-col-01',
    categoryId: 'cat-col-02',
    name: {
      'es-CO': 'Empanaditas de Pipían con Ají de Maní (x6)',
      'es-MX': 'Empanadas de Pipían con Salsa de Cacahuate',
      'en-US': 'Crispy Pipian Empanadas with Peanut Chili',
      'pt-BR': 'Empanadinhas de Pipían com Molho de Amendoim',
      'ja-JP': 'ピピアンのミニ包み揚げ（落花生ピリ辛ソース添え）',
    },
    description: {
      'es-CO': 'Masa crujiente de maíz rellena de guiso tradicional de papa colorada y maní tostado, servidas con ají casero.',
      'es-MX': 'Crujientes de masa de maíz rellenas de papa y cacahuate, acompañadas de salsa de la casa.',
      'en-US': 'Crispy corn dough turnovers filled with spiced red potatoes and roasted peanuts, served with house salsa.',
      'pt-BR': 'Massa de milho estaladiça recheada com batata e amendoim tostado, servida com pimenta da casa.',
      'ja-JP': '芳ばしいロースト落花生とポテトを包んでサクサクに揚げたコーン生地エンパナーダ。',
    },
    price: 24000,
    currency: 'COP',
    isAvailable: true,
    preparationMinutes: 10,
    allergens: ['Maní'],
    imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'item-col-04',
    tenantId: 'rest-col-01',
    categoryId: 'cat-col-03',
    name: {
      'es-CO': 'Lulada Caleña con Leche Condensada',
      'es-MX': 'Bebida Refrescante de Lulo',
      'en-US': 'Chilled Lulo Fruit Nectar',
      'pt-BR': 'Suco Refrescante de Lulo',
      'ja-JP': '南米フルーツ・ルロの特製フレッシュジュース',
    },
    description: {
      'es-CO': 'Pulpa fresca de lulo machacada con hielo frappé, zumo de limón y toque de leche condensada artesanal.',
      'es-MX': 'Bebida helada de fruta tropical lulo con limón y leche condensada.',
      'en-US': 'Crushed tropical lulo citrus pulp over crushed ice with fresh lime and condensed milk drizzle.',
      'pt-BR': 'Polpa fresca de lulo batida com gelo picado, toque de limão e leite condensado.',
      'ja-JP': 'アンデス原産の柑橘ルロの果肉をクラッシュアイスとライムで仕上げた爽快デザートドリンク。',
    },
    price: 15000,
    currency: 'COP',
    isAvailable: true,
    preparationMinutes: 5,
    allergens: ['Lácteos'],
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
  },

  // Mexico items (MXN)
  {
    id: 'item-mex-01',
    tenantId: 'rest-mex-02',
    categoryId: 'cat-mex-01',
    name: {
      'es-CO': 'Tacos al Pastor al Carbón (Orden x4)',
      'es-MX': 'Tacos al Pastor de Trompo al Carbón (4 pzas)',
      'en-US': 'Charcoal-Spit Al Pastor Tacos (4 pcs)',
      'pt-BR': 'Tacos Al Pastor no Carvão (4 un)',
      'ja-JP': '炭火焼きタコス・アル・パストール（4個）',
    },
    description: {
      'es-CO': 'Cerdo marinado en achiote con piña asada, cebolla, cilantro y tortilla de maíz recién hecha.',
      'es-MX': 'Carne de cerdo marinada con achiote y chiles, piña asada, cilantro criollo, cebolla picada y tortillas hechas al momento.',
      'en-US': 'Marinated pork roast carved from the spit with grilled pineapple, fresh cilantro, onions, and handmade tortillas.',
      'pt-BR': 'Carne de porco marinada em urucum com abacaxi grelhado, coentro, cebola e tortilhas frescas.',
      'ja-JP': '特製アチョーテだれに漬け込み回転串で香ばしく焼き上げた豚肉と焼きパイナップルの手作りタコス。',
    },
    price: 185.0,
    currency: 'MXN',
    isAvailable: true,
    preparationMinutes: 12,
    imageUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'item-mex-02',
    tenantId: 'rest-mex-02',
    categoryId: 'cat-mex-01',
    name: {
      'es-CO': 'Guacamole Tradicional con Totopos',
      'es-MX': 'Guacamole Tradicional en Molcajete',
      'en-US': 'Molcajete Hand-Crafted Guacamole',
      'pt-BR': 'Guacamole Tradicional no Pilão',
      'ja-JP': 'すり鉢仕立てのフレッシュワカモレ＆特製トルティーヤチップス',
    },
    description: {
      'es-CO': 'Aguacate hass machacado con pico de gallo, limón y totopos de maíz recién fritos.',
      'es-MX': 'Aguacate Hass de Michoacán preparado al momento en molcajete de piedra volcánica con totopos horneados.',
      'en-US': 'Fresh Hass avocado hand-mashed in volcanic mortar with serrano pepper, lime, cilantro, and warm tortilla chips.',
      'pt-BR': 'Abacate fresco amassado na pedra vulcânica com coentro, limão e totopos crocantes.',
      'ja-JP': 'アボカドとハラペーニョ、ライムを伝統の溶岩石すり鉢で仕上げた極上ワカモレ。',
    },
    price: 140.0,
    currency: 'MXN',
    isAvailable: true,
    preparationMinutes: 8,
    imageUrl: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=600&q=80',
  },

  // USA items (USD)
  {
    id: 'item-usa-01',
    tenantId: 'rest-usa-03',
    categoryId: 'cat-usa-01',
    name: {
      'es-CO': 'Ojo de Bife Madurado en Seco 45 Días',
      'es-MX': 'Ribeye Prime Madurado 45 Días (16 oz)',
      'en-US': '45-Day Dry-Aged Prime Ribeye (16 oz)',
      'pt-BR': 'Ribeye Prime Maturado 45 Dias (450g)',
      'ja-JP': '45日熟成プライムリブアイステーキ（約450g）',
    },
    description: {
      'es-CO': 'Corte USDA Prime con hueso, mantequilla clarificada con romero y ajo confitado.',
      'es-MX': 'Corte de res USDA Prime asado a la parrilla con mantequilla avellanada y sal en escamas.',
      'en-US': 'Bone-in USDA Prime beef, finished with rosemary-infused bone marrow butter and Maldon sea salt flakes.',
      'pt-BR': 'Corte com osso maturado, finalizado com manteiga de tutano aromatizada e flor de sal.',
      'ja-JP': '骨付きUSDAプライム牛を専用庫で45日間ドライエイジング。ローズマリーバターで香ばしく焼き上げました。',
    },
    price: 78.0,
    currency: 'USD',
    isAvailable: true,
    preparationMinutes: 22,
    allergens: ['Lácteos'],
    imageUrl: 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'item-usa-02',
    tenantId: 'rest-usa-03',
    categoryId: 'cat-usa-01',
    name: {
      'es-CO': 'Mac & Cheese con Trufa Negra',
      'es-MX': 'Macarrón al Horno con Trufa',
      'en-US': 'Black Truffle Mac & Cheese Gratin',
      'pt-BR': 'Mac & Cheese Gratinado com Trufas',
      'ja-JP': '黒トリュフ香る濃厚グラタン・マッケンチーズ',
    },
    description: {
      'es-CO': 'Pasta cavatappi con crema de quesos Gruyère y Cheddar añejo, infusionada con trufa negra fresca.',
      'es-MX': 'Pasta cremosa con tres quesos fundidos y aroma de trufa.',
      'en-US': 'Cavatappi pasta baked in aged Vermont cheddar and Gruyère fondue with shaved black truffle.',
      'pt-BR': 'Massa cavatappi ao forno com queijo gruyère e trufas negras.',
      'ja-JP': 'グリュイエールと熟成チェダーチーズを贅沢に使った黒トリュフ風味の特製ベイクドパスタ。',
    },
    price: 26.0,
    currency: 'USD',
    isAvailable: true,
    preparationMinutes: 12,
    allergens: ['Lácteos', 'Gluten'],
    imageUrl: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=600&q=80',
  },

  // Brasil items (BRL)
  {
    id: 'item-bra-01',
    tenantId: 'rest-bra-04',
    categoryId: 'cat-bra-01',
    name: {
      'es-CO': 'Picaña Brasileña a las Brasas',
      'es-MX': 'Picaña al Carbón con Farofa',
      'en-US': 'Charcoal-Grilled Prime Picanha',
      'pt-BR': 'Picanha Nobre Fatiada na Brasa',
      'ja-JP': '炭火直火焼き特選ピカーニャ（ブラジル風イチボ肉）',
    },
    description: {
      'es-CO': 'Corte de picaña a la espada con sal gruesa, farofa de mantequilla y vinagreta fresca.',
      'es-MX': 'Corte tradicional brasileño al carbón acompañado de farofa crocante y vinagreta.',
      'en-US': 'Skewered sirloin cap seared over hardwood lump charcoal, served with toasted cassava farofa and chimichurri.',
      'pt-BR': 'Corte premium assado na brasa com sal grosso, acompanhado de farofa na manteiga e vinagrete da casa.',
      'ja-JP': '極上の赤身と脂身の旨味を豪快に直火串焼きにしたピカーニャ。特製ファロッファ（キャッサバ粉炒め）付き。',
    },
    price: 115.0,
    currency: 'BRL',
    isAvailable: true,
    preparationMinutes: 18,
    imageUrl: 'https://images.unsplash.com/photo-1594041680534-e8c8cdebd659?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'item-bra-02',
    tenantId: 'rest-bra-04',
    categoryId: 'cat-bra-01',
    name: {
      'es-CO': 'Pão de Queijo Minero Recién Horneado (x6)',
      'es-MX': 'Pão de Queijo Tradicional (6 pzas)',
      'en-US': 'Warm Minas Cheese Breads (6 pcs)',
      'pt-BR': 'Cesta de Pão de Queijo Quentinho (6 un)',
      'ja-JP': '焼きたてポン・デ・ケイジョ（ブラジルチーズパン 6個）',
    },
    description: {
      'es-CO': 'Bolitas artesanales de mandioca con queso de Minas Gerais, crujientes por fuera y elásticas por dentro.',
      'es-MX': 'Panecillos brasileños horneados al momento con queso curado.',
      'en-US': 'Freshly baked warm gluten-free tapioca flour buns loaded with artisan Minas cheese.',
      'pt-BR': 'Pãezinhos tradicionais feitos com polvilho e queijo minas curado, crocantes por fora e macios por dentro.',
      'ja-JP': 'タピオカ粉と熟成ミナスチーズをたっぷり練り込み外はカリッと中はもっちり焼き上げました。',
    },
    price: 38.0,
    currency: 'BRL',
    isAvailable: true,
    preparationMinutes: 10,
    allergens: ['Lácteos'],
    imageUrl: 'https://images.unsplash.com/photo-1618449840665-9ed506d73a34?auto=format&fit=crop&w=600&q=80',
  },

  // Japan items (JPY)
  {
    id: 'item-jpn-01',
    tenantId: 'rest-jpn-05',
    categoryId: 'cat-jpn-01',
    name: {
      'es-CO': 'Selección de Sushi Premium Edomae (10 Piezas)',
      'es-MX': 'Selección de Sushi Omakase Edomae (10 pzas)',
      'en-US': 'Edomae Premium Omakase Nigiri (10 pcs)',
      'pt-BR': 'Seleção Omakase Nigiri Edomae (10 peças)',
      'ja-JP': '特選江戸前握り寿司 おまかせ盛り合わせ（十貫）',
    },
    description: {
      'es-CO': 'Pescados frescos de temporada seleccionados diariamente, arroz sazonado con vinagre rojo y salsa de soja madurada.',
      'es-MX': 'Pesca del día madurada, arroz sazonado con akazu artesanal y wasabi natural.',
      'en-US': 'Daily market selection including otoro fatty tuna, sea urchin, Hokkaido scallop, and red vinegar seasoned sushi rice.',
      'pt-BR': 'Seleção diária do chef com atum gordo, vieiras, ouriço do mar e arroz temperado com vinagre tinto.',
      'ja-JP': '本鮪大トロ、北海道産雲丹、天然真鯛、車海老など、豊洲直送の極上旬魚を熟成赤酢のシャリで握る十貫。',
    },
    price: 8500,
    currency: 'JPY',
    isAvailable: true,
    preparationMinutes: 14,
    allergens: ['Pescado', 'Crustáceos'],
    imageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'item-jpn-02',
    tenantId: 'rest-jpn-05',
    categoryId: 'cat-jpn-01',
    name: {
      'es-CO': 'Sukiyaki Tradicional de Wagyu A5 de Kioto',
      'es-MX': 'Sukiyaki de Res Wagyu A5 con Huevo 온천',
      'en-US': 'Kyoto A5 Wagyu Beef Sukiyaki Hotpot',
      'pt-BR': 'Sukiyaki de Carne Wagyu A5',
      'ja-JP': '京都産特選 A5黒毛和牛 すき焼き小鍋仕立て',
    },
    description: {
      'es-CO': 'Finas láminas de res Wagyu A5 marmoleada en caldo dulce warishita con tofu asado, setas shiitake y yema de huevo orgánico.',
      'es-MX': 'Carne Wagyu japonesa A5 en caldo dulce con vegetales y huevo de libre pastoreo.',
      'en-US': 'Thinly sliced melt-in-your-mouth A5 wagyu cooked in artisanal sweet soy broth with grilled tofu, enoki mushrooms, and fresh egg dip.',
      'pt-BR': 'Fatias finas de Wagyu A5 marmorizado em caldo especial com cogumelos shiitake e gema fresca.',
      'ja-JP': '極上のサシが入ったA5黒毛和牛リブロースを秘伝の割り下と焼き豆腐、椎茸とともに。濃厚な特選卵でお召し上がりください。',
    },
    price: 12000,
    currency: 'JPY',
    isAvailable: true,
    preparationMinutes: 20,
    allergens: ['Huevo', 'Soja'],
    imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=600&q=80',
  },
];

export const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: 'res-col-101',
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId: 'tbl-col-04',
    tableNumber: 4,
    customerName: 'Dra. Camila Morales',
    customerEmail: 'camila.morales@hospital.edu.co',
    customerPhone: '+57 310 987 6543',
    date: new Date().toISOString().split('T')[0],
    startTime: '19:30',
    endTime: '21:30',
    partySize: 5,
    status: 'CONFIRMED',
    specialRequests: 'Celebración de grado médico, preferible mesa con buena vista.',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    correlationId: 'tx-seed-res-101',
  },
  {
    id: 'res-col-102',
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId: 'tbl-col-02',
    tableNumber: 2,
    customerName: 'Santiago Herrera',
    customerEmail: 'santiago.h@inversiones.co',
    customerPhone: '+57 312 456 7890',
    date: new Date().toISOString().split('T')[0],
    startTime: '13:00',
    endTime: '15:00',
    partySize: 3,
    status: 'SEATED',
    specialRequests: 'Almuerzo de negocios.',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    correlationId: 'tx-seed-res-102',
  },
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-col-501',
    orderNumber: 'ORD-2026-1001',
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    tableId: 'tbl-col-02',
    tableNumber: 2,
    items: [
      {
        id: 'ord-item-01',
        menuItemId: 'item-col-01',
        name: 'Bandeja Paisa Tradicional',
        unitPrice: 48000,
        quantity: 2,
        notes: 'Uno sin aguacate por favor',
        subtotal: 96000,
      },
      {
        id: 'ord-item-02',
        menuItemId: 'item-col-04',
        name: 'Lulada Caleña con Leche Condensada',
        unitPrice: 15000,
        quantity: 2,
        subtotal: 30000,
      },
    ],
    subtotal: 126000,
    tax: 10080,
    total: 136080,
    currency: 'COP',
    status: 'PREPARING',
    idempotencyKey: 'idem-key-tbl-02-round1',
    qrTokenUsed: 'qr-bog-tbl-02-token192',
    customerName: 'Santiago Herrera',
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    statusHistory: [
      { status: 'RECEIVED', timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(), updatedByRole: 'CUSTOMER' },
      { status: 'PREPARING', timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(), updatedByRole: 'KITCHEN' },
    ],
    correlationId: 'tx-seed-ord-501',
  },
];

export const INITIAL_REVIEWS: Review[] = [
  // Colombia
  {
    id: 'rev-col-01',
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    customerName: 'Carolina Restrepo',
    rating: 5,
    comment: '¡Experiencia insuperable en Bogotá! El ajiaco santafereño y las empanaditas de pipián tenían ese sabor tradicional perfecto. El servicio en mesa fue impecable.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    orderNumber: 'ORD-2026-0982',
    dishName: 'Ajiaco Santafereño Tradicional',
    isVerifiedPurchase: true,
  },
  {
    id: 'rev-col-02',
    tenantId: 'rest-col-01',
    branchId: 'branch-col-bog',
    customerName: 'Juan Pablo Arango',
    rating: 5,
    comment: 'El sistema de pedido por mesa con QR fue súper rápido y el mesero nos entregó todo caliente en menos de 15 minutos.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    isVerifiedPurchase: true,
  },
  {
    id: 'rev-col-03',
    tenantId: 'rest-col-01',
    branchId: 'branch-col-med',
    customerName: 'David Castaño',
    rating: 5,
    comment: 'La sede en El Poblado tiene una atmósfera increíble. La carne asada en su punto y los cócteles excelentes.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    isVerifiedPurchase: true,
  },
  // Mexico
  {
    id: 'rev-mex-01',
    tenantId: 'rest-mex-02',
    branchId: 'branch-mex-cdmx',
    customerName: 'Mariana Morales',
    rating: 5,
    comment: '¡Los tacos al pastor al carbón son de otro nivel! La piña asada, la salsa y las tortillas recién hechas son espectaculares.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    orderNumber: 'ORD-2026-0811',
    dishName: 'Tacos al Pastor de Trompo al Carbón',
    isVerifiedPurchase: true,
  },
  {
    id: 'rev-mex-02',
    tenantId: 'rest-mex-02',
    branchId: 'branch-mex-gdl',
    customerName: 'Rodrigo Ramos',
    rating: 5,
    comment: 'Muy buena experiencia en Guadalajara. La atención fue rápida y la comida deliciosa.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 40).toISOString(),
    isVerifiedPurchase: true,
  },
  // USA
  {
    id: 'rev-usa-01',
    tenantId: 'rest-usa-03',
    branchId: 'branch-usa-nyc',
    customerName: 'Emily Watson',
    rating: 5,
    comment: 'Outstanding dining in SoHo! The prime ribeye was cooked to perfection and the tableside QR ordering made everything seamless.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 16).toISOString(),
    orderNumber: 'ORD-2026-0744',
    dishName: 'Prime Dry-Aged Ribeye Steak',
    isVerifiedPurchase: true,
  },
  {
    id: 'rev-usa-02',
    tenantId: 'rest-usa-03',
    branchId: 'branch-usa-mia',
    customerName: 'Alexander Smith',
    rating: 5,
    comment: 'Vibrant atmosphere in Wynwood, wonderful staff and delicious food. Will definitely be returning soon!',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    isVerifiedPurchase: true,
  },
  // Brazil
  {
    id: 'rev-bra-01',
    tenantId: 'rest-bra-04',
    branchId: 'branch-bra-sp',
    customerName: 'Gabriel Oliveira',
    rating: 5,
    comment: 'A picanha na brasa em Jardins estava simplesmente fantástica. Ponto impecável e o atendimento da equipe foi nota dez.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    orderNumber: 'ORD-2026-0612',
    dishName: 'Picanha Nobre Grelhada na Brasa',
    isVerifiedPurchase: true,
  },
  {
    id: 'rev-bra-02',
    tenantId: 'rest-bra-04',
    branchId: 'branch-bra-rio',
    customerName: 'Beatriz Santos',
    rating: 5,
    comment: 'Lugar super agradável em Ipanema. Pedido chegou quentinho e rápido na mesa.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    isVerifiedPurchase: true,
  },
  // Japan
  {
    id: 'rev-jpn-01',
    tenantId: 'rest-jpn-05',
    branchId: 'branch-jpn-tyo',
    customerName: '田中 健一',
    rating: 5,
    comment: '銀座店での特選A5黒毛和牛すき焼きは至福の美味しさでした。接客もとても丁寧で、居心地の良い時間を過ごせました。',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    orderNumber: 'ORD-2026-0509',
    dishName: '京都産特選 A5黒毛和牛 すき焼き小鍋仕立て',
    isVerifiedPurchase: true,
  },
  {
    id: 'rev-jpn-02',
    tenantId: 'rest-jpn-05',
    branchId: 'branch-jpn-kyo',
    customerName: '佐藤 雅美',
    rating: 5,
    comment: '祇園の風情ある空間で本格的な和食を堪能しました。また特別な日に家族と訪れたいです。',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    isVerifiedPurchase: true,
  },
];

// In-Memory & Persistent Storage singleton
class SmartRestaurantStore {
  private restaurants: Restaurant[] = [...INITIAL_RESTAURANTS];
  private staffAccounts: StaffAccount[] = [...STAFF_ACCOUNTS];
  private tables: Table[] = [...INITIAL_TABLES];
  private categories: MenuCategory[] = [...INITIAL_CATEGORIES];
  private menuItems: MenuItem[] = [...INITIAL_MENU_ITEMS];
  private reservations: Reservation[] = [...INITIAL_RESERVATIONS];
  private orders: Order[] = [...INITIAL_ORDERS];
  private reviews: Review[] = [...INITIAL_REVIEWS];
  private outbox: OutboxEvent[] = [];
  private notifications: InAppNotification[] = [];
  private activeTenantId: string = 'rest-col-01';
  private activeBranchId: string = 'branch-col-bog';

  // Auth State: default is guest CUSTOMER (unauthenticated for staff)
  private currentUser: User = GUEST_CUSTOMER;
  private isStaffLoggedIn: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const savedReservations = localStorage.getItem('sr_reservations');
      if (savedReservations) this.reservations = JSON.parse(savedReservations);

      const savedOrders = localStorage.getItem('sr_orders');
      if (savedOrders) this.orders = JSON.parse(savedOrders);

      const savedReviews = localStorage.getItem('sr_reviews');
      if (savedReviews) this.reviews = JSON.parse(savedReviews);

      const savedOutbox = localStorage.getItem('sr_outbox');
      if (savedOutbox) this.outbox = JSON.parse(savedOutbox);

      const savedTenant = localStorage.getItem('sr_active_tenant');
      if (savedTenant) this.activeTenantId = savedTenant;

      const savedBranch = localStorage.getItem('sr_active_branch');
      if (savedBranch) this.activeBranchId = savedBranch;

      const savedUser = localStorage.getItem('sr_current_user');
      const savedStaffLoggedIn = localStorage.getItem('sr_staff_logged_in');
      if (savedUser && savedStaffLoggedIn === 'true') {
        this.currentUser = JSON.parse(savedUser);
        this.isStaffLoggedIn = true;
      } else {
        this.currentUser = GUEST_CUSTOMER;
        this.isStaffLoggedIn = false;
      }
    } catch {
      // Ignore in SSR
    }
  }

  public reloadFromStorage() {
    this.loadFromStorage();
  }

  private persist() {
    try {
      localStorage.setItem('sr_reservations', JSON.stringify(this.reservations));
      localStorage.setItem('sr_orders', JSON.stringify(this.orders));
      localStorage.setItem('sr_reviews', JSON.stringify(this.reviews));
      localStorage.setItem('sr_outbox', JSON.stringify(this.outbox));
      localStorage.setItem('sr_active_tenant', this.activeTenantId);
      localStorage.setItem('sr_active_branch', this.activeBranchId);
      localStorage.setItem('sr_current_user', JSON.stringify(this.currentUser));
      localStorage.setItem('sr_staff_logged_in', String(this.isStaffLoggedIn));
    } catch {
      // Ignore
    }
  }

  // Multi-tenant switching with automatic country market pairing
  public getActiveTenant(): Restaurant {
    return this.restaurants.find((r) => r.id === this.activeTenantId) || this.restaurants[0];
  }

  public getMarketForTenant(tenantId: string): MarketCode {
    const map: Record<string, MarketCode> = {
      'rest-col-01': 'es-CO',
      'rest-mex-02': 'es-MX',
      'rest-usa-03': 'en-US',
      'rest-bra-04': 'pt-BR',
      'rest-jpn-05': 'ja-JP',
    };
    return map[tenantId] || 'es-CO';
  }

  public getTenantForMarket(market: MarketCode): string {
    const map: Record<MarketCode, string> = {
      'es-CO': 'rest-col-01',
      'es-MX': 'rest-mex-02',
      'en-US': 'rest-usa-03',
      'pt-BR': 'rest-bra-04',
      'ja-JP': 'rest-jpn-05',
    };
    return map[market] || 'rest-col-01';
  }

  public setActiveTenant(tenantId: string) {
    this.activeTenantId = tenantId;
    const r = this.restaurants.find((item) => item.id === tenantId);
    if (r && r.branches.length > 0) {
      this.activeBranchId = r.branches[0].id;
    }
    this.persist();
  }

  public getActiveBranch(): Branch {
    const tenant = this.getActiveTenant();
    return tenant.branches.find((b) => b.id === this.activeBranchId) || tenant.branches[0];
  }

  public setActiveBranch(branchId: string) {
    this.activeBranchId = branchId;
    // ensure active tenant matches branch
    for (const r of this.restaurants) {
      if (r.branches.some((b) => b.id === branchId)) {
        this.activeTenantId = r.id;
        break;
      }
    }
    this.persist();
  }

  // ==========================================
  // AUTHENTICATION & ROLE MANAGEMENT
  // ==========================================
  public getCurrentUser(): User {
    return this.currentUser;
  }

  public isStaffAuthenticated(): boolean {
    return this.isStaffLoggedIn && this.currentUser.role !== 'CUSTOMER';
  }

  public getStaffAccounts(): StaffAccount[] {
    return this.staffAccounts;
  }

  public loginStaff(email: string, password: string): { success: boolean; user?: User; error?: string } {
    const found = this.staffAccounts.find(
      (acc) => acc.email.toLowerCase() === email.toLowerCase() && acc.password === password
    );

    if (!found) {
      return { success: false, error: 'Credenciales inválidas. Verifica tu correo o contraseña.' };
    }

    this.currentUser = {
      id: found.id,
      tenantId: this.activeTenantId,
      name: found.name,
      email: found.email,
      role: found.role,
      avatarUrl: found.avatarUrl,
      assignedBranchId: found.assignedBranchId || this.activeBranchId,
    };
    this.isStaffLoggedIn = true;
    this.persist();
    return { success: true, user: this.currentUser };
  }

  public quickStaffLogin(role: UserRole): User {
    const found = this.staffAccounts.find((acc) => acc.role === role);
    if (found) {
      this.currentUser = {
        id: found.id,
        tenantId: this.activeTenantId,
        name: found.name,
        email: found.email,
        role: found.role,
        avatarUrl: found.avatarUrl,
        assignedBranchId: found.assignedBranchId || this.activeBranchId,
      };
      this.isStaffLoggedIn = true;
    } else {
      this.currentUser = {
        id: `user-${role.toLowerCase()}-${Date.now().toString(36)}`,
        tenantId: this.activeTenantId,
        name: `Usuario ${role}`,
        email: `${role.toLowerCase()}@smartrestaurant.co`,
        role,
        assignedBranchId: this.activeBranchId,
      };
      this.isStaffLoggedIn = true;
    }
    this.persist();
    return this.currentUser;
  }

  public logoutStaff() {
    this.currentUser = GUEST_CUSTOMER;
    this.isStaffLoggedIn = false;
    this.persist();
  }

  // Restaurant & Branch queries
  public getRestaurants(): Restaurant[] {
    return this.restaurants;
  }

  public getBranches(tenantId?: string): Branch[] {
    const targetTenant = tenantId || this.activeTenantId;
    const rest = this.restaurants.find((r) => r.id === targetTenant);
    return rest ? rest.branches : [];
  }

  public getTables(branchId?: string): Table[] {
    this.loadFromStorage();
    const targetBranch = branchId || this.activeBranchId;
    return this.tables.filter((t) => t.branchId === targetBranch);
  }

  public getTableByQrToken(qrToken: string): { table: Table; branch: Branch; restaurant: Restaurant } | null {
    const table = this.tables.find((t) => t.qrToken === qrToken);
    if (!table) return null;
    const restaurant = this.restaurants.find((r) => r.id === table.tenantId);
    if (!restaurant) return null;
    const branch = restaurant.branches.find((b) => b.id === table.branchId);
    if (!branch) return null;
    return { table, branch, restaurant };
  }

  public getMenuCategories(tenantId?: string): MenuCategory[] {
    const targetTenant = tenantId || this.activeTenantId;
    return this.categories.filter((c) => c.tenantId === targetTenant).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getMenuItems(categoryId?: string, tenantId?: string): MenuItem[] {
    const targetTenant = tenantId || this.activeTenantId;
    let items = this.menuItems.filter((i) => i.tenantId === targetTenant);
    if (categoryId) {
      items = items.filter((i) => i.categoryId === categoryId);
    }
    return items;
  }

  public updateMenuItemAvailability(itemId: string, isAvailable: boolean): boolean {
    const item = this.menuItems.find((i) => i.id === itemId);
    if (!item) return false;
    item.isAvailable = isAvailable;
    this.persist();
    return true;
  }

  // ==========================================
  // ADMINISTRATIVE FULL CRUD: MENU ITEMS
  // ==========================================
  public addMenuItem(item: Omit<MenuItem, 'id'>): MenuItem {
    const newItem: MenuItem = {
      ...item,
      id: `item-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
    };
    this.menuItems.push(newItem);
    this.persist();
    return newItem;
  }

  public updateMenuItem(itemId: string, data: Partial<MenuItem>): MenuItem {
    const item = this.menuItems.find((i) => i.id === itemId);
    if (!item) throw new Error('Menu item not found');
    Object.assign(item, data);
    this.persist();
    return item;
  }

  public deleteMenuItem(itemId: string): boolean {
    const index = this.menuItems.findIndex((i) => i.id === itemId);
    if (index === -1) return false;
    this.menuItems.splice(index, 1);
    this.persist();
    return true;
  }

  // ==========================================
  // ADMINISTRATIVE FULL CRUD: TABLES
  // ==========================================
  public addTable(data: {
    branchId: string;
    number: number;
    capacity: number;
    locationArea: 'TERRACE' | 'MAIN_HALL' | 'VIP_LOUNGE' | 'BAR';
  }): Table {
    let targetTenantId = this.activeTenantId;
    for (const r of this.restaurants) {
      if (r.branches.some((b) => b.id === data.branchId)) {
        targetTenantId = r.id;
        break;
      }
    }
    const qrToken = `qr-${data.branchId}-tbl-${data.number}-${Math.random().toString(36).substring(2, 7)}`;
    const newTable: Table = {
      id: `tbl-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
      tenantId: targetTenantId,
      branchId: data.branchId,
      number: Number(data.number),
      capacity: Number(data.capacity),
      locationArea: data.locationArea,
      qrToken,
      status: 'AVAILABLE',
    };
    this.tables.push(newTable);
    this.persist();
    return newTable;
  }

  public updateTable(tableId: string, data: Partial<Omit<Table, 'id' | 'tenantId' | 'qrToken'>>): Table {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table) throw new Error('Table not found');
    Object.assign(table, data);
    this.persist();
    return table;
  }

  public deleteTable(tableId: string): boolean {
    const index = this.tables.findIndex((t) => t.id === tableId);
    if (index === -1) return false;
    this.tables.splice(index, 1);
    this.persist();
    return true;
  }

  // ==========================================
  // ADMINISTRATIVE FULL CRUD: BRANCHES
  // ==========================================
  public updateBranch(branchId: string, data: Partial<Branch>): Branch {
    let targetBranch: Branch | undefined;
    for (const r of this.restaurants) {
      targetBranch = r.branches.find((b) => b.id === branchId);
      if (targetBranch) break;
    }
    if (!targetBranch) throw new Error('Branch not found');
    Object.assign(targetBranch, data);
    this.persist();
    return targetBranch;
  }

  // ==========================================
  // ADMINISTRATIVE FULL CRUD: RESERVATIONS
  // ==========================================
  public updateReservation(reservationId: string, data: Partial<Reservation>): Reservation {
    const res = this.reservations.find((r) => r.id === reservationId);
    if (!res) throw new Error('Reservation not found');
    Object.assign(res, data);
    this.persist();
    return res;
  }

  public deleteReservation(reservationId: string): boolean {
    const index = this.reservations.findIndex((r) => r.id === reservationId);
    if (index === -1) return false;
    this.reservations.splice(index, 1);
    this.persist();
    return true;
  }

  // ==========================================
  // ADMINISTRATIVE FULL CRUD: ORDERS & KITCHEN
  // ==========================================
  public overrideOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    updatedByRole: UserRole,
    note?: string
  ): Order {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');
    order.status = newStatus;
    order.updatedAt = new Date().toISOString();
    order.statusHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: note || `Estado modificado administrativamente por ${updatedByRole}`,
      updatedByRole,
    });
    this.persist();
    return order;
  }

  public cancelOrder(orderId: string, note?: string): Order {
    return this.overrideOrderStatus(
      orderId,
      'CANCELLED',
      'ADMIN',
      note || 'Comanda cancelada por administración'
    );
  }

  public deleteOrder(orderId: string): boolean {
    const index = this.orders.findIndex((o) => o.id === orderId);
    if (index === -1) return false;
    this.orders.splice(index, 1);
    this.persist();
    return true;
  }

  // ==========================================
  // RESERVATION SERVICE (CONCURRENCY LOCKING)
  // ==========================================
  public getReservations(branchId?: string, date?: string): Reservation[] {
    const targetBranch = branchId || this.activeBranchId;
    let res = this.reservations.filter((r) => r.branchId === targetBranch);
    if (date) {
      res = res.filter((r) => r.date === date);
    }
    return res.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  private timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  public checkTableAvailability(
    tableId: string,
    date: string,
    startTime: string,
    endTime: string,
    excludeReservationId?: string
  ): boolean {
    const newStart = this.timeToMinutes(startTime);
    const newEnd = this.timeToMinutes(endTime);

    const conflict = this.reservations.some((r) => {
      if (r.tableId !== tableId) return false;
      if (r.date !== date) return false;
      if (r.status === 'CANCELLED') return false;
      if (excludeReservationId && r.id === excludeReservationId) return false;

      const existingStart = this.timeToMinutes(r.startTime);
      const existingEnd = this.timeToMinutes(r.endTime);

      return newStart < existingEnd && newEnd > existingStart;
    });

    return !conflict;
  }

  public createReservation(data: {
    tenantId: string;
    branchId: string;
    tableId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    date: string;
    startTime: string;
    partySize: number;
    specialRequests?: string;
  }): { reservation: Reservation; outboxEvent: OutboxEvent } {
    const branch = this.getBranches(data.tenantId).find((b) => b.id === data.branchId);
    if (!branch) {
      throw new Error(`Branch ${data.branchId} not found in tenant ${data.tenantId}`);
    }

    const table = this.tables.find((t) => t.id === data.tableId && t.branchId === data.branchId);
    if (!table) {
      throw new Error(`Table ${data.tableId} not found`);
    }

    if (data.partySize > table.capacity) {
      throw new Error(`Party size (${data.partySize}) exceeds table capacity (${table.capacity})`);
    }

    const startMins = this.timeToMinutes(data.startTime);
    const endMins = startMins + 120;
    const endHours = Math.floor(endMins / 60)
      .toString()
      .padStart(2, '0');
    const endMinutes = (endMins % 60).toString().padStart(2, '0');
    const endTime = `${endHours}:${endMinutes}`;

    const isAvailable = this.checkTableAvailability(data.tableId, data.date, data.startTime, endTime);
    if (!isAvailable) {
      const err = new Error('CONCURRENCY_CONFLICT: Table is already reserved during the requested time window.');
      (err as any).statusCode = 409;
      throw err;
    }

    const correlationId = generateCorrelationId('tx-res');

    const reservation: Reservation = {
      id: `res-${Date.now().toString(36)}`,
      tenantId: data.tenantId,
      branchId: data.branchId,
      tableId: data.tableId,
      tableNumber: table.number,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      date: data.date,
      startTime: data.startTime,
      endTime,
      partySize: data.partySize,
      status: 'CONFIRMED',
      specialRequests: data.specialRequests,
      createdAt: new Date().toISOString(),
      correlationId,
    };

    this.reservations.push(reservation);

    const outboxEvent: OutboxEvent = {
      id: `evt-${Date.now().toString(36)}`,
      eventType: 'ReservationCreated',
      aggregateType: 'Reservation',
      aggregateId: reservation.id,
      tenantId: reservation.tenantId,
      branchId: reservation.branchId,
      correlationId,
      schemaVersion: '1.0',
      payload: {
        reservationId: reservation.id,
        tableNumber: reservation.tableNumber,
        customerName: reservation.customerName,
        date: reservation.date,
        startTime: reservation.startTime,
        partySize: reservation.partySize,
      },
      createdAt: new Date().toISOString(),
      status: 'PUBLISHED',
      retryCount: 0,
    };

    this.outbox.push(outboxEvent);
    this.persist();

    eventBus.publish(outboxEvent);

    return { reservation, outboxEvent };
  }

  public cancelReservation(reservationId: string): Reservation {
    const res = this.reservations.find((r) => r.id === reservationId);
    if (!res) throw new Error('Reservation not found');
    res.status = 'CANCELLED';

    const outboxEvent: OutboxEvent = {
      id: `evt-${Date.now().toString(36)}`,
      eventType: 'ReservationCancelled',
      aggregateType: 'Reservation',
      aggregateId: res.id,
      tenantId: res.tenantId,
      branchId: res.branchId,
      correlationId: generateCorrelationId('tx-res-cancel'),
      schemaVersion: '1.0',
      payload: { reservationId: res.id, customerName: res.customerName },
      createdAt: new Date().toISOString(),
      status: 'PUBLISHED',
      retryCount: 0,
    };
    this.outbox.push(outboxEvent);
    this.persist();
    eventBus.publish(outboxEvent);

    return res;
  }

  // ==========================================
  // ORDER SERVICE (SERVER-SIDE PRICE & IDEMPOTENCY)
  // ==========================================
  public getOrders(branchId?: string, status?: OrderStatus): Order[] {
    this.loadFromStorage();
    const targetBranch = branchId || this.activeBranchId;
    let ords = this.orders.filter((o) => o.branchId === targetBranch);
    if (status) {
      ords = ords.filter((o) => o.status === status);
    }
    return ords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getOrderById(orderId: string): Order | undefined {
    return this.orders.find((o) => o.id === orderId);
  }

  public createOrder(data: {
    tenantId: string;
    branchId: string;
    tableId: string;
    qrToken: string;
    idempotencyKey: string;
    customerName?: string;
    items: Array<{ menuItemId: string; quantity: number; notes?: string }>;
  }): { order: Order; outboxEvent: OutboxEvent; isDuplicate: boolean } {
    const existing = this.orders.find((o) => o.idempotencyKey === data.idempotencyKey);
    if (existing) {
      return {
        order: existing,
        outboxEvent: this.outbox.find((e) => e.aggregateId === existing.id)!,
        isDuplicate: true,
      };
    }

    const tableInfo = this.getTableByQrToken(data.qrToken);
    if (!tableInfo || tableInfo.table.id !== data.tableId) {
      throw new Error('INVALID_QR_TOKEN: The provided table session token is invalid or expired.');
    }

    const branch = tableInfo.branch;

    let calculatedSubtotal = 0;
    const validatedItems: Array<{
      id: string;
      menuItemId: string;
      name: string;
      unitPrice: number;
      quantity: number;
      notes?: string;
      subtotal: number;
    }> = [];

    for (const itemReq of data.items) {
      const dbItem = this.menuItems.find((i) => i.id === itemReq.menuItemId && i.tenantId === data.tenantId);
      if (!dbItem) {
        throw new Error(`Item ${itemReq.menuItemId} does not exist in the tenant catalog.`);
      }
      if (!dbItem.isAvailable) {
        throw new Error(`Item "${dbItem.name['es-CO'] || 'Producto'}" is temporarily out of stock.`);
      }
      if (itemReq.quantity <= 0) {
        throw new Error('Quantity must be greater than zero.');
      }

      const itemSubtotal = dbItem.price * itemReq.quantity;
      calculatedSubtotal += itemSubtotal;

      validatedItems.push({
        id: `ord-it-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
        menuItemId: dbItem.id,
        name: dbItem.name['es-CO'] || 'Item',
        unitPrice: dbItem.price,
        quantity: itemReq.quantity,
        notes: itemReq.notes,
        subtotal: itemSubtotal,
      });
    }

    const taxRate = branch.commercialCurrency === 'COP' ? 0.08 : branch.commercialCurrency === 'MXN' ? 0.16 : 0.1;
    const calculatedTax = Math.round(calculatedSubtotal * taxRate);
    const calculatedTotal = calculatedSubtotal + calculatedTax;

    const orderNumber = `ORD-${new Date().getFullYear()}-${(this.orders.length + 1001).toString()}`;
    const correlationId = generateCorrelationId('tx-ord');

    const order: Order = {
      id: `ord-${Date.now().toString(36)}`,
      orderNumber,
      tenantId: data.tenantId,
      branchId: data.branchId,
      tableId: data.tableId,
      tableNumber: tableInfo.table.number,
      items: validatedItems,
      subtotal: calculatedSubtotal,
      tax: calculatedTax,
      total: calculatedTotal,
      currency: branch.commercialCurrency,
      status: 'RECEIVED',
      idempotencyKey: data.idempotencyKey,
      qrTokenUsed: data.qrToken,
      customerName: data.customerName || `Mesa ${tableInfo.table.number}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [
        {
          status: 'RECEIVED',
          timestamp: new Date().toISOString(),
          note: 'Pedido registrado vía código QR de mesa',
          updatedByRole: 'CUSTOMER',
        },
      ],
      correlationId,
    };

    this.orders.unshift(order);

    const outboxEvent: OutboxEvent = {
      id: `evt-${Date.now().toString(36)}`,
      eventType: 'OrderCreated',
      aggregateType: 'Order',
      aggregateId: order.id,
      tenantId: order.tenantId,
      branchId: order.branchId,
      correlationId,
      schemaVersion: '1.0',
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableNumber: order.tableNumber,
        itemsCount: order.items.length,
        total: order.total,
        currency: order.currency,
      },
      createdAt: new Date().toISOString(),
      status: 'PUBLISHED',
      retryCount: 0,
    };

    this.outbox.unshift(outboxEvent);
    this.persist();

    eventBus.publish(outboxEvent);

    return { order, outboxEvent, isDuplicate: false };
  }

  // ==========================================
  // KITCHEN SERVICE (FINITE STATE MACHINE)
  // ==========================================
  public updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    updatedByRole: UserRole,
    note?: string
  ): { order: Order; outboxEvent: OutboxEvent } {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      RECEIVED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'CANCELLED'],
      READY: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [],
      CANCELLED: [],
    };

    if (!validTransitions[order.status].includes(newStatus)) {
      throw new Error(
        `INVALID_TRANSITION: Cannot transition order ${order.orderNumber} from ${order.status} to ${newStatus}.`
      );
    }

    const previousStatus = order.status;
    order.status = newStatus;
    order.updatedAt = new Date().toISOString();
    order.statusHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note,
      updatedByRole,
    });

    let eventType: OutboxEvent['eventType'] = 'OrderStatusChanged';
    if (newStatus === 'PREPARING') eventType = 'OrderAcceptedByKitchen';
    if (newStatus === 'READY') eventType = 'OrderReady';
    if (newStatus === 'DELIVERED') eventType = 'OrderDelivered';

    const outboxEvent: OutboxEvent = {
      id: `evt-${Date.now().toString(36)}`,
      eventType,
      aggregateType: 'Kitchen',
      aggregateId: order.id,
      tenantId: order.tenantId,
      branchId: order.branchId,
      correlationId: generateCorrelationId('tx-kds'),
      schemaVersion: '1.0',
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        previousStatus,
        newStatus,
        tableNumber: order.tableNumber,
      },
      createdAt: new Date().toISOString(),
      status: 'PUBLISHED',
      retryCount: 0,
    };

    this.outbox.unshift(outboxEvent);
    this.persist();

    eventBus.publish(outboxEvent);

    return { order, outboxEvent };
  }

  // Outbox & Recommendations
  public getOutboxEvents(): OutboxEvent[] {
    return this.outbox;
  }

  public getOperationalRecommendations(branchId?: string): OperationalRecommendation[] {
    const targetBranch = branchId || this.activeBranchId;
    const branchOrders = this.orders.filter((o) => o.branchId === targetBranch);
    const branchReservations = this.reservations.filter((r) => r.branchId === targetBranch && r.status !== 'CANCELLED');
    const branchTables = this.tables.filter((t) => t.branchId === targetBranch);

    const recommendations: OperationalRecommendation[] = [];

    const totalCapacity = branchTables.reduce((acc, t) => acc + t.capacity, 0) || 50;
    const reservedSeats = branchReservations.reduce((acc, r) => acc + r.partySize, 0);
    const occupancyRatio = reservedSeats / totalCapacity;

    if (occupancyRatio > 0.65) {
      recommendations.push({
        id: 'rec-cap-01',
        tenantId: this.activeTenantId,
        branchId: targetBranch,
        title: 'Alta Demanda de Reservas Próxima a Saturar Salón',
        explanation: `El ${Math.round(occupancyRatio * 100)}% de la capacidad de asientos (${reservedSeats}/${totalCapacity}) se encuentra reservado para esta jornada.`,
        justifyingData: { totalCapacity, reservedSeats, occupancyPercentage: Math.round(occupancyRatio * 100) },
        generatedAt: new Date().toISOString(),
        priority: 'HIGH',
        suggestedAction: 'Activar turno adicional de personal de salón y restringir reservas sin confirmación.',
        category: 'CAPACITY',
      });
    }

    const pendingInKitchen = branchOrders.filter((o) => o.status === 'RECEIVED' || o.status === 'PREPARING');
    if (pendingInKitchen.length >= 2) {
      recommendations.push({
        id: 'rec-kitch-02',
        tenantId: this.activeTenantId,
        branchId: targetBranch,
        title: 'Acumulación de Comandas en Estación de Cocina',
        explanation: `Se registran ${pendingInKitchen.length} comandas en preparación simultánea, lo cual puede incrementar el tiempo de entrega.`,
        justifyingData: { pendingOrdersCount: pendingInKitchen.length },
        generatedAt: new Date().toISOString(),
        priority: pendingInKitchen.length > 3 ? 'HIGH' : 'MEDIUM',
        suggestedAction: 'Reasignar un cocinero de apoyo a la línea caliente y priorizar comandas con más de 12 minutos.',
        category: 'KITCHEN_SPEED',
      });
    }

    return recommendations;
  }

  public getDashboardMetrics(branchId?: string) {
    const targetBranch = branchId || this.activeBranchId;
    const branchOrders = this.orders.filter((o) => o.branchId === targetBranch);
    const branchReservations = this.reservations.filter((r) => r.branchId === targetBranch);
    const branchTables = this.tables.filter((t) => t.branchId === targetBranch);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayReservations = branchReservations.filter((r) => r.date === todayStr && r.status !== 'CANCELLED').length;
    const activeOrders = branchOrders.filter((o) => o.status === 'RECEIVED' || o.status === 'PREPARING').length;
    const occupiedTables = branchTables.filter((t) => t.status === 'OCCUPIED' || t.status === 'RESERVED').length;
    const totalTables = branchTables.length || 1;
    const occupancyPercent = Math.round((occupiedTables / totalTables) * 100);

    const todayRevenue = branchOrders
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + o.total, 0);

    const currency = this.getActiveBranch().commercialCurrency;

    return {
      todayReservations,
      activeOrders,
      occupancyPercent,
      occupiedTables,
      totalTables,
      kitchenBacklog: activeOrders,
      avgPrepTimeMinutes: 14,
      todayRevenue,
      currency,
    };
  }

  public getReviews(branchId?: string, tenantId?: string): Review[] {
    this.loadFromStorage();
    let result = this.reviews;
    if (tenantId) {
      result = result.filter((r) => r.tenantId === tenantId);
    }
    if (branchId) {
      result = result.filter((r) => r.branchId === branchId);
    }
    return [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public addReview(input: {
    tenantId?: string;
    branchId?: string;
    customerName: string;
    rating: number;
    comment: string;
    orderNumber?: string;
    dishName?: string;
    isVerifiedPurchase?: boolean;
  }): Review {
    this.loadFromStorage();
    const finalTenantId = input.tenantId || this.activeTenantId;
    const finalBranchId = input.branchId || this.activeBranchId;
    const ratingClamped = Math.max(1, Math.min(5, Math.round(input.rating)));

    const newReview: Review = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenantId: finalTenantId,
      branchId: finalBranchId,
      customerName: input.customerName.trim() || 'Cliente',
      rating: ratingClamped,
      comment: input.comment.trim(),
      createdAt: new Date().toISOString(),
      orderNumber: input.orderNumber,
      dishName: input.dishName,
      isVerifiedPurchase: input.isVerifiedPurchase ?? true,
    };

    this.reviews.unshift(newReview);

    // Distributed Outbox Event
    const correlationId = generateCorrelationId();
    const outboxEvent: OutboxEvent = {
      id: `evt-rev-${Date.now()}`,
      eventType: 'ReviewCreated',
      aggregateType: 'Review',
      aggregateId: newReview.id,
      tenantId: finalTenantId,
      branchId: finalBranchId,
      correlationId,
      schemaVersion: '1.0',
      payload: { ...newReview },
      createdAt: new Date().toISOString(),
      status: 'PUBLISHED',
      retryCount: 0,
    };
    this.outbox.unshift(outboxEvent);

    this.persist();

    // Publish to Distributed Event Bus
    eventBus.publish(outboxEvent);

    return newReview;
  }

  public getReviewStats(branchId?: string, tenantId?: string) {
    const list = this.getReviews(branchId, tenantId);
    const count = list.length;
    const breakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (count === 0) {
      return { average: 5.0, count: 0, breakdown };
    }
    let total = 0;
    for (const r of list) {
      total += r.rating;
      const rounded = Math.max(1, Math.min(5, Math.round(r.rating)));
      breakdown[rounded] = (breakdown[rounded] || 0) + 1;
    }
    const average = parseFloat((total / count).toFixed(1));
    return { average, count, breakdown };
  }
}

export const store = new SmartRestaurantStore();
