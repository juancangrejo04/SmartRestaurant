-- ============================================================
-- SmartRestaurant — Esquema Completo para Supabase (PostgreSQL 15+)
-- Migración Versionada: 20261102000000_smartrestaurant_schema.sql
-- Arquitectura: Vercel Serverless + Supabase PostgreSQL & Auth + Upstash QStash
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

-- 3. Perfiles de Usuario y Roles (Vinculado a auth.users de Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY, -- Coincide con auth.uid() de Supabase Auth
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL, -- OWNER, ADMIN, WAITER, KITCHEN, CUSTOMER
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

-- Vista pública de mesas que NUNCA expone el qr_token
CREATE OR REPLACE VIEW public_restaurant_tables AS
    SELECT id, tenant_id, branch_id, table_number, capacity, location_area, status
    FROM restaurant_tables;

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

-- 13. Transactional Outbox (Estructura robusta con concurrencia y worker locking)
CREATE TABLE IF NOT EXISTS outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, CLAIMED, PUBLISHED, FAILED
    worker_id VARCHAR(128),
    locked_at TIMESTAMPTZ,
    retry_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_claim ON outbox_events(status, locked_at, created_at);

-- 14. Eventos Procesados (Máquina de estados de idempotencia en QStash)
CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(128) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    topic VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING', -- PENDING, PROCESSING, PROCESSED, FAILED
    attempts INT NOT NULL DEFAULT 1,
    error_message TEXT,
    worker_id VARCHAR(128),
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_events_status ON processed_events(status, locked_at);

-- ============================================================
-- Funciones Auxiliares para Políticas RLS y Aislamiento Multi-Tenant
-- ============================================================
CREATE OR REPLACE FUNCTION current_user_tenant_id()
RETURNS VARCHAR(64) AS $$
  SELECT tenant_id FROM users WHERE id::text = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS VARCHAR(32) AS $$
  SELECT role FROM users WHERE id::text = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_branch_id()
RETURNS VARCHAR(64) AS $$
  SELECT assigned_branch_id FROM users WHERE id::text = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- Funciones RPC Seguras para Operaciones Transaccionales
-- ============================================================

-- Validar QR de Mesa de forma segura (sin exponer todos los qr_tokens a consultas públicas)
CREATE OR REPLACE FUNCTION verify_table_qr_token(p_token VARCHAR(128))
RETURNS TABLE (
    table_id VARCHAR(64),
    tenant_id VARCHAR(64),
    branch_id VARCHAR(64),
    table_number INT,
    capacity INT,
    status VARCHAR(32)
) AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.tenant_id, t.branch_id, t.table_number, t.capacity, t.status
    FROM restaurant_tables t
    WHERE t.qr_token = p_token
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reclamar eventos de Outbox de forma atómica evitando carreras entre workers serverless
CREATE OR REPLACE FUNCTION claim_outbox_events(
    p_worker_id VARCHAR(128),
    p_batch_size INT DEFAULT 20,
    p_timeout_seconds INT DEFAULT 60
)
RETURNS SETOF outbox_events AS $$
DECLARE
    v_cutoff TIMESTAMPTZ := NOW() - (p_timeout_seconds || ' seconds')::INTERVAL;
BEGIN
    RETURN QUERY
    WITH claimable AS (
        SELECT id
        FROM outbox_events
        WHERE status = 'PENDING'
           OR (status = 'CLAIMED' AND locked_at < v_cutoff)
        ORDER BY created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events o
    SET status = 'CLAIMED',
        worker_id = p_worker_id,
        locked_at = NOW()
    FROM claimable c
    WHERE o.id = c.id
    RETURNING o.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Marcar evento de Outbox como publicado exitosamente
CREATE OR REPLACE FUNCTION mark_outbox_event_published(p_event_id VARCHAR(64))
RETURNS VOID AS $$
BEGIN
    UPDATE outbox_events
    SET status = 'PUBLISHED',
        published_at = NOW(),
        worker_id = NULL,
        locked_at = NULL,
        error_message = NULL
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Marcar evento de Outbox con error para reintento con backoff
CREATE OR REPLACE FUNCTION mark_outbox_event_failed(p_event_id VARCHAR(64), p_error TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE outbox_events
    SET retry_count = retry_count + 1,
        status = CASE WHEN retry_count + 1 >= 5 THEN 'FAILED' ELSE 'PENDING' END,
        error_message = p_error,
        worker_id = NULL,
        locked_at = NULL
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reclamar evento entrante de QStash de forma idempotente con estados PENDING, PROCESSING, PROCESSED, FAILED
CREATE OR REPLACE FUNCTION claim_incoming_event(
    p_event_id VARCHAR(128),
    p_event_type VARCHAR(64),
    p_topic VARCHAR(128) DEFAULT NULL,
    p_timeout_seconds INT DEFAULT 60
)
RETURNS JSONB AS $$
DECLARE
    v_existing processed_events%ROWTYPE;
    v_cutoff TIMESTAMPTZ := NOW() - (p_timeout_seconds || ' seconds')::INTERVAL;
BEGIN
    SELECT * INTO v_existing FROM processed_events WHERE event_id = p_event_id FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO processed_events (event_id, event_type, topic, status, attempts, locked_at, created_at)
        VALUES (p_event_id, p_event_type, p_topic, 'PROCESSING', 1, NOW(), NOW());
        RETURN jsonb_build_object('action', 'PROCESS', 'status', 'PROCESSING', 'isDuplicate', false);
    END IF;

    IF v_existing.status = 'PROCESSED' THEN
        RETURN jsonb_build_object('action', 'SKIP', 'status', 'PROCESSED', 'isDuplicate', true);
    END IF;

    -- Si falló o la ejecución anterior quedó abandonada por timeout, permitir reintento
    IF v_existing.status = 'FAILED' OR (v_existing.status = 'PROCESSING' AND v_existing.locked_at < v_cutoff) THEN
        UPDATE processed_events
        SET status = 'PROCESSING',
            attempts = attempts + 1,
            locked_at = NOW()
        WHERE event_id = p_event_id;
        RETURN jsonb_build_object('action', 'RETRY', 'status', 'PROCESSING', 'isDuplicate', false);
    END IF;

    -- Activamente en ejecución en otra función
    RETURN jsonb_build_object('action', 'WAIT_OR_SKIP', 'status', v_existing.status, 'isDuplicate', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Finalizar procesamiento de evento entrante de QStash
CREATE OR REPLACE FUNCTION finalize_incoming_event(
    p_event_id VARCHAR(128),
    p_status VARCHAR(32), -- 'PROCESSED' o 'FAILED'
    p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE processed_events
    SET status = p_status,
        error_message = p_error,
        processed_at = CASE WHEN p_status = 'PROCESSED' THEN NOW() ELSE processed_at END,
        locked_at = NULL
    WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Creación Atómica Transaccional de Pedido y Evento Outbox en PostgreSQL
CREATE OR REPLACE FUNCTION create_order_atomic(
    p_order_id VARCHAR(64),
    p_tenant_id VARCHAR(64),
    p_branch_id VARCHAR(64),
    p_table_id VARCHAR(64),
    p_table_number INT,
    p_order_number VARCHAR(32),
    p_customer_name VARCHAR(255),
    p_subtotal NUMERIC(14,2),
    p_tax NUMERIC(14,2),
    p_total NUMERIC(14,2),
    p_currency VARCHAR(3),
    p_idempotency_key VARCHAR(128),
    p_qr_token VARCHAR(128),
    p_correlation_id VARCHAR(128),
    p_items JSONB,
    p_outbox_event_id VARCHAR(64)
)
RETURNS JSONB AS $$
DECLARE
    v_existing orders%ROWTYPE;
    v_item JSONB;
BEGIN
    SELECT * INTO v_existing FROM orders WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'isDuplicateReplay', true, 'order', row_to_json(v_existing));
    END IF;

    INSERT INTO orders (
        id, tenant_id, branch_id, table_id, table_number, order_number,
        customer_name, status, subtotal, tax, total, currency,
        idempotency_key, qr_token, correlation_id, created_at
    ) VALUES (
        p_order_id, p_tenant_id, p_branch_id, p_table_id, p_table_number, p_order_number,
        p_customer_name, 'RECEIVED', p_subtotal, p_tax, p_total, p_currency,
        p_idempotency_key, p_qr_token, p_correlation_id, NOW()
    );

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO order_items (
            id, order_id, menu_item_id, name, quantity, unit_price, total_price, notes, created_at
        ) VALUES (
            v_item->>'id', p_order_id, v_item->>'menu_item_id', v_item->>'name',
            (v_item->>'quantity')::INT, (v_item->>'unit_price')::NUMERIC,
            (v_item->>'total_price')::NUMERIC, v_item->>'notes', NOW()
        );
    END LOOP;

    INSERT INTO outbox_events (
        id, aggregate_type, aggregate_id, event_type, payload,
        correlation_id, tenant_id, branch_id, status, retry_count, created_at
    ) VALUES (
        p_outbox_event_id, 'Order', p_order_id, 'OrderCreated',
        jsonb_build_object(
            'orderId', p_order_id,
            'orderNumber', p_order_number,
            'tenantId', p_tenant_id,
            'branchId', p_branch_id,
            'tableNumber', p_table_number,
            'total', p_total,
            'currency', p_currency
        ),
        p_correlation_id, p_tenant_id, p_branch_id, 'PENDING', 0, NOW()
    );

    RETURN jsonb_build_object('success', true, 'isDuplicateReplay', false, 'orderId', p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Row Level Security (RLS) en Supabase
-- Aislamiento estricto por tenant_id y roles RBAC
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

-- 1. Tenants (Público solo lectura básica; mutación solo dueño autenticado de su tenant)
DROP POLICY IF EXISTS "Public Read Tenants" ON tenants;
CREATE POLICY "Public Read Tenants" ON tenants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin Manage Tenants" ON tenants;
CREATE POLICY "Admin Manage Tenants" ON tenants FOR ALL
USING (auth.role() = 'service_role' OR (current_user_role() = 'OWNER' AND id = current_user_tenant_id()));

-- 2. Branches
DROP POLICY IF EXISTS "Public Read Branches" ON branches;
CREATE POLICY "Public Read Branches" ON branches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin Manage Branches" ON branches;
CREATE POLICY "Admin Manage Branches" ON branches FOR ALL
USING (auth.role() = 'service_role' OR (current_user_role() IN ('OWNER', 'ADMIN') AND tenant_id = current_user_tenant_id()));

-- 3. Restaurant Tables (Protegida: NUNCA expone qr_tokens al público general)
-- Solo personal autenticado del tenant o backend con service_role puede listar mesas
DROP POLICY IF EXISTS "Staff Read Tables" ON restaurant_tables;
CREATE POLICY "Staff Read Tables" ON restaurant_tables FOR SELECT
USING (
    auth.role() = 'service_role' OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id())
);

DROP POLICY IF EXISTS "Admin Manage Tables" ON restaurant_tables;
CREATE POLICY "Admin Manage Tables" ON restaurant_tables FOR ALL
USING (auth.role() = 'service_role' OR (current_user_role() IN ('OWNER', 'ADMIN') AND tenant_id = current_user_tenant_id()));

-- 4. Menu Categories
DROP POLICY IF EXISTS "Public Read Menu Categories" ON menu_categories;
CREATE POLICY "Public Read Menu Categories" ON menu_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin Manage Menu Categories" ON menu_categories;
CREATE POLICY "Admin Manage Menu Categories" ON menu_categories FOR ALL
USING (auth.role() = 'service_role' OR (current_user_role() IN ('OWNER', 'ADMIN') AND tenant_id = current_user_tenant_id()));

-- 5. Menu Items (Lectura pública de productos disponibles; mutación restringida a administradores del tenant)
DROP POLICY IF EXISTS "Public Read Menu Items" ON menu_items;
CREATE POLICY "Public Read Menu Items" ON menu_items FOR SELECT
USING (is_available = true OR auth.role() = 'service_role' OR (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id()));

DROP POLICY IF EXISTS "Admin Manage Menu Items" ON menu_items;
CREATE POLICY "Admin Manage Menu Items" ON menu_items FOR ALL
USING (auth.role() = 'service_role' OR (current_user_role() IN ('OWNER', 'ADMIN') AND tenant_id = current_user_tenant_id()));

-- 6. Reviews
DROP POLICY IF EXISTS "Public Read Reviews" ON reviews;
CREATE POLICY "Public Read Reviews" ON reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Insert Reviews" ON reviews;
CREATE POLICY "Insert Reviews" ON reviews FOR INSERT
WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated' OR auth.role() = 'anon');

DROP POLICY IF EXISTS "Admin Manage Reviews" ON reviews;
CREATE POLICY "Admin Manage Reviews" ON reviews FOR ALL
USING (auth.role() = 'service_role' OR (current_user_role() IN ('OWNER', 'ADMIN') AND tenant_id = current_user_tenant_id()));

-- 7. Orders (Aislamiento Multi-Tenant Estricto)
-- Ningún usuario externo puede insertar directamente sin pasar por backend validado (service_role)
DROP POLICY IF EXISTS "Orders Tenant Isolation Read" ON orders;
CREATE POLICY "Orders Tenant Isolation Read" ON orders FOR SELECT
USING (
    auth.role() = 'service_role' OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id())
);

DROP POLICY IF EXISTS "Orders Tenant Insert" ON orders;
CREATE POLICY "Orders Tenant Insert" ON orders FOR INSERT
WITH CHECK (
    auth.role() = 'service_role' OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id() AND current_user_role() IN ('WAITER', 'ADMIN', 'OWNER'))
);

DROP POLICY IF EXISTS "Orders Tenant Isolation Mutate" ON orders;
CREATE POLICY "Orders Tenant Isolation Mutate" ON orders FOR UPDATE
USING (
    auth.role() = 'service_role' OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id() AND current_user_role() IN ('KITCHEN', 'WAITER', 'ADMIN', 'OWNER'))
);

-- 8. Order Items
DROP POLICY IF EXISTS "Order Items Tenant Isolation Read" ON order_items;
CREATE POLICY "Order Items Tenant Isolation Read" ON order_items FOR SELECT
USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = current_user_tenant_id())
);

DROP POLICY IF EXISTS "Order Items Insert" ON order_items;
CREATE POLICY "Order Items Insert" ON order_items FOR INSERT
WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = current_user_tenant_id() AND current_user_role() IN ('WAITER', 'ADMIN', 'OWNER'))
);

-- 9. Reservations (Aislamiento Multi-Tenant Estricto)
DROP POLICY IF EXISTS "Reservations Tenant Isolation Read" ON reservations;
CREATE POLICY "Reservations Tenant Isolation Read" ON reservations FOR SELECT
USING (
    auth.role() = 'service_role' OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id() AND current_user_role() IN ('OWNER', 'ADMIN', 'WAITER')) OR
    (auth.jwt()->>'email' IS NOT NULL AND customer_email = auth.jwt()->>'email')
);

DROP POLICY IF EXISTS "Reservations Tenant Insert" ON reservations;
CREATE POLICY "Reservations Tenant Insert" ON reservations FOR INSERT
WITH CHECK (
    auth.role() = 'service_role' OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id() AND current_user_role() IN ('OWNER', 'ADMIN', 'WAITER'))
);

DROP POLICY IF EXISTS "Reservations Tenant Isolation Mutate" ON reservations;
CREATE POLICY "Reservations Tenant Isolation Mutate" ON reservations FOR UPDATE
USING (
    auth.role() = 'service_role' OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id() AND current_user_role() IN ('OWNER', 'ADMIN', 'WAITER'))
);

-- 10. Users y Perfiles
DROP POLICY IF EXISTS "Users Tenant Isolation" ON users;
CREATE POLICY "Users Tenant Isolation" ON users FOR ALL
USING (
    auth.role() = 'service_role' OR
    id::text = auth.uid()::text OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id() AND current_user_role() IN ('OWNER', 'ADMIN'))
);

-- 11. Notifications
DROP POLICY IF EXISTS "Notifications Tenant Isolation" ON notifications;
CREATE POLICY "Notifications Tenant Isolation" ON notifications FOR ALL
USING (
    auth.role() = 'service_role' OR
    (current_user_tenant_id() IS NOT NULL AND tenant_id = current_user_tenant_id())
);

-- 12. Outbox & Processed Events (Solo accesibles mediante Service Role del Backend / Serverless)
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

-- Mesas Semilla con Tokens QR Únicos
INSERT INTO restaurant_tables (id, tenant_id, branch_id, table_number, capacity, location_area, qr_token, status) VALUES
    ('tbl-col-01', 'rest-col-01', 'branch-col-bog', 1, 4, 'MAIN_HALL', 'qr-token-col-bog-tbl-01', 'AVAILABLE'),
    ('tbl-col-02', 'rest-col-01', 'branch-col-bog', 2, 2, 'TERRACE', 'qr-token-col-bog-tbl-02', 'AVAILABLE'),
    ('tbl-jpn-01', 'rest-jpn-05', 'branch-jpn-tok', 1, 2, 'WASHOKU_COUNTER', 'qr-token-jpn-tok-tbl-01', 'AVAILABLE'),
    ('tbl-jpn-02', 'rest-jpn-05', 'branch-jpn-tok', 2, 4, 'TATAMI_ROOM', 'qr-token-jpn-tok-tbl-02', 'AVAILABLE')
ON CONFLICT (id) DO NOTHING;

-- Perfiles de Demostración Semilla (Sin contraseñas; gestionados por Supabase Auth)
INSERT INTO users (id, tenant_id, name, email, role, assigned_branch_id) VALUES
    ('usr-owner-col', 'rest-col-01', 'Carlos Mendoza', 'carlos@smartrestaurant.co', 'OWNER', 'branch-col-bog'),
    ('usr-admin-col', 'rest-col-01', 'Valeria Gómez', 'valeria.bogota@smartrestaurant.co', 'ADMIN', 'branch-col-bog'),
    ('usr-waiter-col', 'rest-col-01', 'Santiago Rivas', 'santiago.mesero@smartrestaurant.co', 'WAITER', 'branch-col-bog'),
    ('usr-kitchen-col', 'rest-col-01', 'Chef Álvaro Morales', 'cocina.bogota@smartrestaurant.co', 'KITCHEN', 'branch-col-bog'),
    ('usr-admin-jpn', 'rest-jpn-05', 'Kenji Takahashi (高橋 健二)', 'kenji.tokyo@smartrestaurant.jp', 'ADMIN', 'branch-jpn-tok'),
    ('usr-kitchen-jpn', 'rest-jpn-05', 'Chef Ryu Tanaka (田中 隆)', 'ryu.tokyo@smartrestaurant.jp', 'KITCHEN', 'branch-jpn-tok')
ON CONFLICT (id) DO NOTHING;
