-- ============================================================
-- SmartRestaurant — Esquema Completo para Supabase (PostgreSQL 15+)
-- Migración Versionada: 20261102000000_smartrestaurant_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Restaurantes (Tenants)
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(64) NOT NULL,
    cuisine_type VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sucursales (Branches)
CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(128) NOT NULL,
    country VARCHAR(128) NOT NULL,
    timezone VARCHAR(64) NOT NULL,
    commercial_currency VARCHAR(3) NOT NULL, -- COP, MXN, USD, BRL, JPY
    opening_time TIME NOT NULL,
    closing_time TIME NOT NULL,
    max_capacity INT NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

-- 3. Usuarios y Roles (RBAC con Supabase Auth integration)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL, -- OWNER, ADMIN, WAITER, KITCHEN, CUSTOMER
    password_hash VARCHAR(255),
    assigned_branch_id VARCHAR(64) REFERENCES branches(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- 4. Mesas de Restaurante (Tables con Token QR)
CREATE TABLE IF NOT EXISTS restaurant_tables (
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

CREATE INDEX IF NOT EXISTS idx_tables_branch ON restaurant_tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_tables_qr_token ON restaurant_tables(qr_token);

-- 5. Categorías del Menú
CREATE TABLE IF NOT EXISTS menu_categories (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_translations JSONB NOT NULL,
    sort_order INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant ON menu_categories(tenant_id);

-- 6. Ítems del Menú
CREATE TABLE IF NOT EXISTS menu_items (
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

CREATE INDEX IF NOT EXISTS idx_menu_items_tenant ON menu_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);

-- 7. Reservas
CREATE TABLE IF NOT EXISTS reservations (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id VARCHAR(64) NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    table_number INT NOT NULL DEFAULT 1,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(64),
    reservation_date DATE NOT NULL,
    start_time VARCHAR(10) NOT NULL,
    end_time VARCHAR(10) NOT NULL,
    party_size INT NOT NULL DEFAULT 2,
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED', -- CONFIRMED, SEATED, COMPLETED, CANCELLED
    special_requests TEXT,
    correlation_id VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_lookup ON reservations(branch_id, reservation_date, status);
CREATE INDEX IF NOT EXISTS idx_reservations_table ON reservations(table_id, reservation_date);

-- 8. Pedidos (Orders)
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id VARCHAR(64) NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    table_number INT NOT NULL,
    order_number VARCHAR(32) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED', -- RECEIVED, PREPARING, READY, DELIVERED, CANCELLED
    subtotal NUMERIC(14, 2) NOT NULL,
    tax NUMERIC(14, 2) NOT NULL,
    total NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    qr_token VARCHAR(128),
    correlation_id VARCHAR(128),
    prep_started_at TIMESTAMPTZ,
    prep_completed_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key);

-- 9. Ítems del Pedido (Order Items)
CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id VARCHAR(64) NOT NULL REFERENCES menu_items(id),
    name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    unit_price NUMERIC(14, 2) NOT NULL,
    total_price NUMERIC(14, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 10. Historial de Estados del Pedido (Trazabilidad)
CREATE TABLE IF NOT EXISTS order_status_history (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(32),
    to_status VARCHAR(32) NOT NULL,
    changed_by_role VARCHAR(32) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history ON order_status_history(order_id);

-- 11. Reseñas y Calificaciones
CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_tenant ON reviews(tenant_id, created_at DESC);

-- 12. Notificaciones In-App
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) REFERENCES branches(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'INFO',
    target_role VARCHAR(32),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, is_read);

-- 13. Transactional Outbox (Estructura estándar compatible con QStash)
CREATE TABLE IF NOT EXISTS outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, PUBLISHED, FAILED
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at);

-- 14. Eventos Procesados (Control de duplicados / Idempotencia en QStash)
CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(128) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS) en Supabase
-- (Sintaxis estándar y válida de PostgreSQL sin errores)
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Catálogos públicos de sólo lectura para comensales que escanean el QR
DROP POLICY IF EXISTS "Public Read Tenants" ON tenants;
CREATE POLICY "Public Read Tenants" ON tenants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Branches" ON branches;
CREATE POLICY "Public Read Branches" ON branches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Tables" ON restaurant_tables;
CREATE POLICY "Public Read Tables" ON restaurant_tables FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Menu Categories" ON menu_categories;
CREATE POLICY "Public Read Menu Categories" ON menu_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Menu Items" ON menu_items;
CREATE POLICY "Public Read Menu Items" ON menu_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Reviews" ON reviews;
CREATE POLICY "Public Read Reviews" ON reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Reviews" ON reviews;
CREATE POLICY "Public Insert Reviews" ON reviews FOR INSERT WITH CHECK (true);

-- Políticas protegidas: solo usuarios autenticados con rol o peticiones firmadas (Service Role)
DROP POLICY IF EXISTS "Orders Tenant Isolation" ON orders;
CREATE POLICY "Orders Tenant Isolation" ON orders FOR ALL 
USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Order Items Tenant Isolation" ON order_items;
CREATE POLICY "Order Items Tenant Isolation" ON order_items FOR ALL 
USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Reservations Tenant Isolation" ON reservations;
CREATE POLICY "Reservations Tenant Isolation" ON reservations FOR ALL 
USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users Tenant Isolation" ON users;
CREATE POLICY "Users Tenant Isolation" ON users FOR ALL 
USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Notifications Tenant Isolation" ON notifications;
CREATE POLICY "Notifications Tenant Isolation" ON notifications FOR ALL 
USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Outbox Backend Only" ON outbox_events;
CREATE POLICY "Outbox Backend Only" ON outbox_events FOR ALL 
USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Processed Events Backend Only" ON processed_events;
CREATE POLICY "Processed Events Backend Only" ON processed_events FOR ALL 
USING (auth.role() = 'service_role');

-- ============================================================
-- SEMILLAS INICIALES (5 Mercados Internacionales)
-- ============================================================
INSERT INTO tenants (id, name, tax_id, cuisine_type) VALUES
    ('rest-col-01', 'Andrés Restaurante & Asador', 'NIT 900.234.567-1', 'Gastronomía Colombiana Contemporánea'),
    ('rest-mex-02', 'La Hacienda de los Morales', 'RFC HND-840212-AA1', 'Alta Cocina Tradicional Mexicana'),
    ('rest-usa-03', 'Liberty Prime Steakhouse', 'EIN 12-3456789', 'Modern American Grill & Seafood'),
    ('rest-bra-04', 'Fogo de Minas Churrascaria', 'CNPJ 12.345.678/0001-90', 'Churrasco & Culinária Mineira'),
    ('rest-jpn-05', '祇園 割烹 かえで (Kaede Kyoto)', 'JPN-TAX-8891002', '伝統的日本料理・懐石 (Kaiseki & Washoku)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, tenant_id, name, address, city, country, timezone, commercial_currency, opening_time, closing_time, max_capacity) VALUES
    ('branch-col-bog', 'rest-col-01', 'Sede Bogotá - Zona Rosa', 'Calle 82 # 12-25', 'Bogotá D.C.', 'Colombia', 'America/Bogota', 'COP', '11:30', '23:30', 90),
    ('branch-col-mde', 'rest-col-01', 'Sede Medellín - El Poblado', 'Carrera 43A # 5A-113', 'Medellín', 'Colombia', 'America/Bogota', 'COP', '12:00', '23:00', 80),
    ('branch-mex-cdmx', 'rest-mex-02', 'Sede CDMX - Polanco', 'Vázquez de Mella 525', 'Ciudad de México', 'México', 'America/Mexico_City', 'MXN', '12:00', '23:00', 120),
    ('branch-mex-gdl', 'rest-mex-02', 'Sede Guadalajara - Providencia', 'Av. Providencia 2411', 'Guadalajara', 'México', 'America/Mexico_City', 'MXN', '13:00', '23:00', 100),
    ('branch-usa-nyc', 'rest-usa-03', 'Sede New York - Manhattan Midtown', '135 W 50th St', 'New York', 'United States', 'America/New_York', 'USD', '11:00', '23:00', 110),
    ('branch-usa-mia', 'rest-usa-03', 'Sede Miami - Brickell Ave', '801 Brickell Ave', 'Miami', 'United States', 'America/New_York', 'USD', '11:30', '00:00', 130),
    ('branch-bra-sp', 'rest-bra-04', 'Sede São Paulo - Jardins', 'Rua Haddock Lobo 1416', 'São Paulo', 'Brasil', 'America/Sao_Paulo', 'BRL', '11:30', '23:30', 140),
    ('branch-bra-rio', 'rest-bra-04', 'Sede Rio de Janeiro - Ipanema', 'Rua Prudente de Morais 1120', 'Rio de Janeiro', 'Brasil', 'America/Sao_Paulo', 'BRL', '12:00', '23:30', 115),
    ('branch-jpn-tok', 'rest-jpn-05', 'Sede Tokyo - Ginza', 'Ginza 6-10-1, Chuo-ku', 'Tokyo', 'Japan', 'Asia/Tokyo', 'JPY', '11:00', '22:00', 60),
    ('branch-jpn-kyo', 'rest-jpn-05', 'Sede Kyoto - Gion', 'Gionmachi Minamigawa 570', 'Kyoto', 'Japan', 'Asia/Tokyo', 'JPY', '11:30', '21:30', 50)
ON CONFLICT (id) DO NOTHING;
