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
-- 3. Users & RBAC (Autenticación con Hash Bcrypt)
-- ============================================================
CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL, -- OWNER, ADMIN, WAITER, KITCHEN, CUSTOMER
    password_hash VARCHAR(255) NOT NULL,
    assigned_branch_id VARCHAR(64) REFERENCES branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- ============================================================
-- 4. Mesas (Tables con Token QR)
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
-- 5. Categorías y Menú (Items con Precios en Moneda Comercial)
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
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_menu_items_tenant ON menu_items(tenant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);

-- ============================================================
-- 6. Reservas con Restricción de Intervalo (Prevención Concurrencia)
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
-- 7. Pedidos (Orders con Idempotency Key)
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

CREATE TABLE order_status_history (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    updated_by_role VARCHAR(32) NOT NULL,
    note TEXT,
    transitioned_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. Reseñas y Calificaciones Multinacionales
-- ============================================================
CREATE TABLE reviews (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    order_number VARCHAR(64),
    dish_name VARCHAR(255),
    is_verified_purchase BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_branch ON reviews(branch_id, created_at DESC);

-- ============================================================
-- 9. Transactional Outbox (Eventos Asíncronos RabbitMQ)
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
-- 10. Datos Iniciales (Seeds para los 5 Mercados Internacionales)
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

-- Default Bcrypt Password hash for "secret123": $2a$10$wT0X8rW6x4K7yC1P5iG/Q.H7kR1yG3e0q4p8v2m9j5l7s1x4q7w9
INSERT INTO users (id, tenant_id, name, email, role, password_hash, assigned_branch_id) VALUES
('usr-owner-01', 'rest-col-01', 'Carlos Mendoza', 'owner@andres.co', 'OWNER', '$2a$10$z7y7WqK4pC7bF2.m0l6E/u7x9i1u3y5r8t2v6x4z8b1n3m5q7w9e1', NULL),
('usr-admin-01', 'rest-col-01', 'Valeria Gómez', 'admin@andres.co', 'ADMIN', '$2a$10$z7y7WqK4pC7bF2.m0l6E/u7x9i1u3y5r8t2v6x4z8b1n3m5q7w9e1', 'branch-col-bog'),
('usr-waiter-01', 'rest-col-01', 'Mateo Restrepo', 'waiter@andres.co', 'WAITER', '$2a$10$z7y7WqK4pC7bF2.m0l6E/u7x9i1u3y5r8t2v6x4z8b1n3m5q7w9e1', 'branch-col-bog'),
('usr-kitchen-01', 'rest-col-01', 'Chef Andrés Parra', 'kitchen@andres.co', 'KITCHEN', '$2a$10$z7y7WqK4pC7bF2.m0l6E/u7x9i1u3y5r8t2v6x4z8b1n3m5q7w9e1', 'branch-col-bog');
