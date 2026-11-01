-- SmartRestaurant Distributed SaaS Database Schema (PostgreSQL 16)
-- Multi-tenant isolation, range exclusion locks, idempotency keys, and Transactional Outbox

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================
-- 1. Tenants (Restaurantes Multi-tenant)
-- ============================================================
CREATE TABLE tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(64) NOT NULL,
    cuisine_type VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Branches (Sucursales con Moneda Comercial y Zona Horaria)
-- ============================================================
CREATE TABLE branches (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(128) NOT NULL,
    country VARCHAR(128) NOT NULL,
    timezone VARCHAR(64) NOT NULL, -- IANA Timezone (e.g. 'America/Bogota')
    commercial_currency VARCHAR(3) NOT NULL, -- 'COP', 'MXN', 'USD', 'BRL', 'JPY'
    opening_time TIME NOT NULL,
    closing_time TIME NOT NULL,
    max_capacity INT NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_branches_tenant ON branches(tenant_id);

-- ============================================================
-- 3. Mesas (Tables con Token QR)
-- ============================================================
CREATE TABLE restaurant_tables (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_number INT NOT NULL,
    capacity INT NOT NULL DEFAULT 4,
    location_area VARCHAR(64) NOT NULL DEFAULT 'MAIN_HALL',
    qr_token VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
    CONSTRAINT unq_branch_table UNIQUE (branch_id, table_number)
);

CREATE INDEX idx_tables_branch ON restaurant_tables(branch_id);
CREATE INDEX idx_tables_qr_token ON restaurant_tables(qr_token);

-- ============================================================
-- 4. Categorías y Menú (Items con Precios en Moneda Comercial)
-- ============================================================
CREATE TABLE menu_categories (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_translations JSONB NOT NULL,
    sort_order INT NOT NULL DEFAULT 1
);

CREATE TABLE menu_items (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id VARCHAR(64) NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name_translations JSONB NOT NULL,
    description_translations JSONB NOT NULL,
    price NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    preparation_minutes INT NOT NULL DEFAULT 15,
    allergens JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_menu_items_tenant ON menu_items(tenant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);

-- ============================================================
-- 5. Reservas con Restricción de Intervalo (Prevención Concurrencia)
-- ============================================================
CREATE TABLE reservations (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id VARCHAR(64) NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(64) NOT NULL,
    reservation_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    party_size INT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED', -- CONFIRMED, SEATED, COMPLETED, CANCELLED
    special_requests TEXT,
    correlation_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reservations_lookup ON reservations(branch_id, reservation_date, status);

-- ============================================================
-- 6. Pedidos (Orders con Idempotency Key)
-- ============================================================
CREATE TABLE orders (
    id VARCHAR(64) PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL UNIQUE,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id VARCHAR(64) NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    subtotal NUMERIC(14, 2) NOT NULL,
    tax NUMERIC(14, 2) NOT NULL,
    total NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED', -- RECEIVED, PREPARING, READY, DELIVERED, CANCELLED
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    qr_token_used VARCHAR(128) NOT NULL,
    customer_name VARCHAR(128),
    correlation_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX idx_orders_idempotency ON orders(idempotency_key);

CREATE TABLE order_items (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id VARCHAR(64) NOT NULL REFERENCES menu_items(id),
    name VARCHAR(255) NOT NULL,
    unit_price NUMERIC(14, 2) NOT NULL,
    quantity INT NOT NULL,
    notes TEXT,
    subtotal NUMERIC(14, 2) NOT NULL
);

-- ============================================================
-- 7. Historial de Transiciones de Cocina (KDS Machine History)
-- ============================================================
CREATE TABLE order_status_history (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    updated_by_role VARCHAR(32) NOT NULL,
    note TEXT,
    transitioned_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. Transactional Outbox (Eventos Asíncronos RabbitMQ)
-- ============================================================
CREATE TABLE outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    schema_version VARCHAR(16) NOT NULL DEFAULT '1.0',
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, PUBLISHED, FAILED
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events(status, created_at) WHERE status = 'PENDING';

-- ============================================================
-- 9. Datos Iniciales (Seeds para los 5 Mercados Internacionales)
-- ============================================================
INSERT INTO tenants (id, name, tax_id, cuisine_type) VALUES
('rest-col-01', 'Andrés Restaurante & Asador', 'NIT 900.234.567-1', 'Gastronomía Colombiana Contemporánea'),
('rest-mex-02', 'Taquería y Cantina Los Aluxes', 'RFC ALU980415-K92', 'Cocina Mexicana de Tradición'),
('rest-usa-03', 'Manhattan Prime Steakhouse', 'EIN 13-9874521', 'New York Classic Steakhouse'),
('rest-bra-04', 'Fogo & Sabor Churrascaria', 'CNPJ 24.382.910/0001-55', 'Churrasco Gaúcho Tradicional'),
('rest-jpn-05', '割烹 銀座 桜 (Kappo Sakura Ginza)', '法人番号 7010401056789', '伝統日本料理・会席 (Kaiseki & Edomae)');

INSERT INTO branches (id, tenant_id, name, address, city, country, timezone, commercial_currency, opening_time, closing_time, max_capacity) VALUES
-- Colombia (2 sedes)
('branch-col-bog', 'rest-col-01', 'Sede Bogotá - Zona Rosa', 'Calle 82 # 12-25', 'Bogotá', 'Colombia', 'America/Bogota', 'COP', '12:00', '23:30', 80),
('branch-col-med', 'rest-col-01', 'Sede Medellín - El Poblado', 'Carrera 35 # 8A-42', 'Medellín', 'Colombia', 'America/Bogota', 'COP', '12:30', '23:00', 60),
-- México (2 sucursales)
('branch-mex-cdmx', 'rest-mex-02', 'Sucursal CDMX - Polanco', 'Av. Presidente Masaryk 310', 'Ciudad de México', 'México', 'America/Mexico_City', 'MXN', '13:00', '01:00', 90),
('branch-mex-gdl', 'rest-mex-02', 'Sucursal Guadalajara - Zapopan', 'Av. Patria 1890', 'Guadalajara', 'México', 'America/Mexico_City', 'MXN', '13:00', '00:00', 75),
-- Estados Unidos (2 branches)
('branch-usa-soho', 'rest-usa-03', 'SoHo Flagship - Manhattan', '482 Broome Street', 'New York', 'United States', 'America/New_York', 'USD', '17:00', '23:30', 110),
('branch-usa-miami', 'rest-usa-03', 'Brickell Financial - Miami', '1100 Brickell Bay Drive', 'Miami', 'United States', 'America/New_York', 'USD', '17:00', '00:00', 95),
-- Brasil (2 unidades)
('branch-bra-sp', 'rest-bra-04', 'Unidade São Paulo - Itaim Bibi', 'Rua Joaquim Floriano, 466', 'São Paulo', 'Brasil', 'America/Sao_Paulo', 'BRL', '12:00', '23:00', 100),
('branch-bra-rio', 'rest-bra-04', 'Unidade Rio de Janeiro - Copacabana', 'Av. Atlântica 2100', 'Rio de Janeiro', 'Brasil', 'America/Sao_Paulo', 'BRL', '12:00', '23:30', 85),
-- Japón (2 支店)
('branch-jpn-ginza', 'rest-jpn-05', '東京 銀座本店 (Tokyo Ginza)', '東京都中央区銀座 6-10-1', 'Tokyo', '日本 (Japan)', 'Asia/Tokyo', 'JPY', '11:30', '22:00', 45),
('branch-jpn-kyoto', 'rest-jpn-05', '京都 祇園別邸 (Kyoto Gion)', '京都府京都市東山区祇園町南側 570', 'Kyoto', '日本 (Japan)', 'Asia/Tokyo', 'JPY', '12:00', '21:30', 35);

INSERT INTO restaurant_tables (id, tenant_id, branch_id, table_number, capacity, location_area, qr_token, status) VALUES
('tbl-col-01', 'rest-col-01', 'branch-col-bog', 1, 2, 'MAIN_HALL', 'qr-bog-tbl-01-token884', 'AVAILABLE'),
('tbl-col-02', 'rest-col-01', 'branch-col-bog', 2, 4, 'MAIN_HALL', 'qr-bog-tbl-02-token192', 'OCCUPIED'),
('tbl-col-03', 'rest-col-01', 'branch-col-bog', 3, 4, 'TERRACE', 'qr-bog-tbl-03-token503', 'AVAILABLE'),
('tbl-col-04', 'rest-col-01', 'branch-col-bog', 4, 6, 'VIP_LOUNGE', 'qr-bog-tbl-04-token377', 'RESERVED'),
('tbl-med-01', 'rest-col-01', 'branch-col-med', 1, 4, 'TERRACE', 'qr-med-tbl-01-tok771', 'AVAILABLE'),
('tbl-mex-01', 'rest-mex-02', 'branch-mex-cdmx', 1, 2, 'TERRACE', 'qr-mex-tbl-01-token441', 'AVAILABLE'),
('tbl-gdl-01', 'rest-mex-02', 'branch-mex-gdl', 1, 4, 'MAIN_HALL', 'qr-gdl-tbl-01-tok881', 'AVAILABLE'),
('tbl-usa-01', 'rest-usa-03', 'branch-usa-soho', 1, 2, 'BAR', 'qr-usa-tbl-01-token112', 'AVAILABLE'),
('tbl-mia-01', 'rest-usa-03', 'branch-usa-miami', 1, 4, 'TERRACE', 'qr-mia-tbl-01-tok991', 'AVAILABLE'),
('tbl-bra-01', 'rest-bra-04', 'branch-bra-sp', 1, 4, 'MAIN_HALL', 'qr-bra-tbl-01-token334', 'AVAILABLE'),
('tbl-rio-01', 'rest-bra-04', 'branch-bra-rio', 1, 4, 'TERRACE', 'qr-rio-tbl-01-tok336', 'AVAILABLE'),
('tbl-jpn-01', 'rest-jpn-05', 'branch-jpn-ginza', 1, 2, 'VIP_LOUNGE', 'qr-jpn-tbl-01-token445', 'AVAILABLE'),
('tbl-kyo-01', 'rest-jpn-05', 'branch-jpn-kyoto', 1, 4, 'VIP_LOUNGE', 'qr-kyo-tbl-01-tok557', 'AVAILABLE');

INSERT INTO menu_categories (id, tenant_id, name_translations, sort_order) VALUES
('cat-col-01', 'rest-col-01', '{"es-CO": "Platos Fuertes", "en-US": "Main Entrees", "ja-JP": "自慢のメイン料理"}'::jsonb, 1),
('cat-mex-01', 'rest-mex-02', '{"es-MX": "Tacos al Carbón", "en-US": "Charcoal Tacos", "ja-JP": "特選タコス"}'::jsonb, 1),
('cat-usa-01', 'rest-usa-03', '{"en-US": "Prime Steaks", "es-CO": "Cortes Prime", "ja-JP": "プライム熟成ステーキ"}'::jsonb, 1),
('cat-bra-01', 'rest-bra-04', '{"pt-BR": "Carnes Nobres", "en-US": "Rodizio Meats", "ja-JP": "シュラスコ肉料理"}'::jsonb, 1),
('cat-jpn-01', 'rest-jpn-05', '{"ja-JP": "季節の会席・極上握り寿司", "en-US": "Seasonal Omakase", "es-CO": "Sushi y Kaiseki"}'::jsonb, 1);

INSERT INTO menu_items (id, tenant_id, category_id, name_translations, description_translations, price, currency, is_available, preparation_minutes) VALUES
('item-col-01', 'rest-col-01', 'cat-col-01', '{"es-CO": "Bandeja Paisa Tradicional", "en-US": "Paisa Platter", "ja-JP": "伝統のバンデハ・パイサ"}'::jsonb, '{"es-CO": "Chicharrón crujiente, carne molida, frijoles y arepa", "ja-JP": "カリカリの豚バラ揚げと特製煮豆のプレート"}'::jsonb, 48000.00, 'COP', TRUE, 18),
('item-mex-01', 'rest-mex-02', 'cat-mex-01', '{"es-MX": "Tacos al Pastor al Carbón", "en-US": "Al Pastor Tacos", "ja-JP": "炭火焼きタコス・アル・パストール"}'::jsonb, '{"es-MX": "Cerdo al pastor con piña asada y cilantro", "ja-JP": "回転串で香ばしく焼き上げた豚肉と焼きパイナップル"}'::jsonb, 185.00, 'MXN', TRUE, 12),
('item-usa-01', 'rest-usa-03', 'cat-usa-01', '{"en-US": "45-Day Dry-Aged Prime Ribeye", "es-CO": "Bife Madurado 45 Días", "ja-JP": "45日熟成プライムリブアイステーキ"}'::jsonb, '{"en-US": "16oz USDA Prime beef with bone marrow butter", "ja-JP": "骨付きUSDAプライム牛のドライエイジングステーキ"}'::jsonb, 78.00, 'USD', TRUE, 22),
('item-bra-01', 'rest-bra-04', 'cat-bra-01', '{"pt-BR": "Picanha Nobre na Brasa", "en-US": "Grilled Prime Picanha", "ja-JP": "直火焼き特選ピカーニャ"}'::jsonb, '{"pt-BR": "Picanha fatiada com farofa e vinagrete", "ja-JP": "極上赤身と脂身を豪快に直火串焼きにしたピカーニャ"}'::jsonb, 115.00, 'BRL', TRUE, 18),
('item-jpn-01', 'rest-jpn-05', 'cat-jpn-01', '{"ja-JP": "特選江戸前握り寿司 おまかせ盛り合わせ", "en-US": "Edomae Omakase Nigiri", "es-CO": "Sushi Edomae Premium"}'::jsonb, '{"ja-JP": "豊洲直送の極上旬魚十貫盛り合わせ", "en-US": "10 pieces of fresh seasonal market fish"}'::jsonb, 8500.00, 'JPY', TRUE, 14);
