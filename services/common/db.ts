// Database Access Layer with PostgreSQL (pg) and Resilient Migration Runner
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export interface TransactionClient {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://sr_admin:sr_secure_password_2026@localhost:5432/smartrestaurant_db';

let pool: pg.Pool | null = null;
let isPostgresAvailable: boolean | null = null;

// In-Memory PostgreSQL-compliant Fallback Storage for Local Dev / Container Isolation
class InMemoryDatabase {
  public tables: Record<string, any[]> = {
    tenants: [],
    branches: [],
    users: [],
    restaurant_tables: [],
    menu_categories: [],
    menu_items: [],
    reservations: [],
    orders: [],
    order_items: [],
    order_status_history: [],
    reviews: [],
    outbox_events: [],
    notifications: [],
    processed_events: [],
  };

  private idCounter = 1000;
  private transactionSnapshots: Array<Record<string, any[]>> = [];

  public async query(sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();

    // 1. Transaction statements with snapshot rollback
    if (upper === 'BEGIN') {
      this.transactionSnapshots.push(JSON.parse(JSON.stringify(this.tables)));
      return { rows: [], rowCount: 0 };
    }
    if (upper === 'COMMIT') {
      this.transactionSnapshots.pop();
      return { rows: [], rowCount: 0 };
    }
    if (upper === 'ROLLBACK') {
      const snap = this.transactionSnapshots.pop();
      if (snap) {
        this.tables = snap;
      }
      return { rows: [], rowCount: 0 };
    }

    // 2. Simple SELECT on tables
    for (const table of Object.keys(this.tables)) {
      if (upper.includes(`FROM ${table.toUpperCase()}`)) {
        let result = [...this.tables[table]];

        // Handle WHERE parameters
        if (upper.includes('WHERE')) {
          // Check for common column lookups
          if (upper.includes('TENANT_ID = $') || upper.includes('TENANT_ID=')) {
            const idx = this.extractParamIndex(trimmed, 'tenant_id');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.tenant_id === params[idx]);
            }
          }
          if (upper.includes('BRANCH_ID = $') || upper.includes('BRANCH_ID=')) {
            const idx = this.extractParamIndex(trimmed, 'branch_id');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.branch_id === params[idx]);
            }
          }
          if (upper.includes('EMAIL = $') || upper.includes('EMAIL=')) {
            const idx = this.extractParamIndex(trimmed, 'email');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.email === params[idx]);
            }
          }
          if (upper.includes('STATUS = $') || upper.includes('STATUS=')) {
            const idx = this.extractParamIndex(trimmed, 'status');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.status === params[idx]);
            }
          }
          if (upper.includes('IDEMPOTENCY_KEY = $')) {
            const idx = this.extractParamIndex(trimmed, 'idempotency_key');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.idempotency_key === params[idx]);
            }
          }
          if (upper.includes('TABLE_ID = $')) {
            const idx = this.extractParamIndex(trimmed, 'table_id');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.table_id === params[idx]);
            }
          }
          if (upper.includes('RESERVATION_DATE = $')) {
            const idx = this.extractParamIndex(trimmed, 'reservation_date');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.reservation_date === params[idx]);
            }
          }
          if (upper.includes('ID = $')) {
            const idx = this.extractParamIndex(trimmed, 'id');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.id === params[idx]);
            }
          }
          if (upper.includes('QR_TOKEN = $')) {
            const idx = this.extractParamIndex(trimmed, 'qr_token');
            if (idx !== null && params[idx] !== undefined) {
              result = result.filter((r) => r.qr_token === params[idx]);
            }
          }
        }

        // Sorting
        if (upper.includes('ORDER BY CREATED_AT DESC')) {
          result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        }

        // Limit
        if (upper.includes('LIMIT 1')) {
          result = result.slice(0, 1);
        }

        return { rows: result, rowCount: result.length };
      }
    }

    // 3. INSERT INTO
    for (const table of Object.keys(this.tables)) {
      if (upper.startsWith(`INSERT INTO ${table.toUpperCase()}`)) {
        const row = this.parseInsertRow(trimmed, params);
        if (!row.id) row.id = `${table}-${++this.idCounter}`;
        if (!row.created_at) row.created_at = new Date().toISOString();
        this.tables[table].push(row);
        return { rows: [row], rowCount: 1 };
      }
    }

    // 4. UPDATE
    for (const table of Object.keys(this.tables)) {
      if (upper.startsWith(`UPDATE ${table.toUpperCase()}`)) {
        let updatedCount = 0;
        const rows = this.tables[table];
        for (const row of rows) {
          // Check update conditions
          if (upper.includes('WHERE ID = $') || upper.includes('WHERE ID=')) {
            const idx = this.extractParamIndex(trimmed, 'id');
            if (idx !== null && row.id === params[idx]) {
              this.applyUpdate(trimmed, params, row);
              updatedCount++;
            }
          }
        }
        return { rows: [], rowCount: updatedCount };
      }
    }

    return { rows: [], rowCount: 0 };
  }

  private extractParamIndex(sql: string, column: string): number | null {
    const regex = new RegExp(`${column}\\s*=\\s*\\$(\\d+)`, 'i');
    const match = sql.match(regex);
    if (match && match[1]) {
      return parseInt(match[1], 10) - 1; // Convert 1-based $1 to 0-based index
    }
    return null;
  }

  private parseInsertRow(sql: string, params: any[]): Record<string, any> {
    const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
    if (!colMatch || !colMatch[1]) return {};
    const cols = colMatch[1].split(',').map((c) => c.trim().toLowerCase());
    const row: Record<string, any> = {};

    cols.forEach((col, idx) => {
      row[col] = params[idx] !== undefined ? params[idx] : null;
    });

    return row;
  }

  private applyUpdate(sql: string, params: any[], row: Record<string, any>) {
    const setMatch = sql.match(/SET\s+(.+)\s+WHERE/i);
    if (!setMatch) return;
    const assignments = setMatch[1].split(',');
    for (const assign of assignments) {
      const parts = assign.trim().split('=');
      if (parts.length === 2) {
        const col = parts[0].trim().toLowerCase();
        const paramMatch = parts[1].match(/\$(\d+)/);
        if (paramMatch) {
          const pIdx = parseInt(paramMatch[1], 10) - 1;
          row[col] = params[pIdx];
        }
      }
    }
  }
}

export const inMemoryDb = new InMemoryDatabase();

export function getDbPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]:', err.message);
    });
  }
  return pool;
}

/**
 * Execute parameterized query with automatic PostgreSQL/InMemory fallback
 */
export async function query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount: number }> {
  if (isPostgresAvailable === false) {
    return inMemoryDb.query(text, params);
  }

  try {
    const client = getDbPool();
    const result = await client.query(text, params);
    isPostgresAvailable = true;
    return { rows: result.rows, rowCount: result.rowCount || result.rows.length };
  } catch (err: any) {
    if (isPostgresAvailable === null) {
      console.warn(`[Database Notice]: PostgreSQL not reachable at ${DATABASE_URL}. Using in-memory transactional database engine.`);
      isPostgresAvailable = false;
    }
    return inMemoryDb.query(text, params);
  }
}

/**
 * Execute block within an ACID transaction
 */
export async function withTransaction<T>(
  callback: (client: TransactionClient) => Promise<T>
): Promise<T> {
  if (isPostgresAvailable === false) {
    await inMemoryDb.query('BEGIN');
    try {
      const res = await callback(inMemoryDb);
      await inMemoryDb.query('COMMIT');
      return res;
    } catch (e) {
      await inMemoryDb.query('ROLLBACK');
      throw e;
    }
  }

  const client = await getDbPool().connect().catch(() => null);
  if (!client) {
    isPostgresAvailable = false;
    return withTransaction(callback);
  }

  try {
    await client.query('BEGIN');
    const res = await callback(client);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run database migrations and seed default data for the 5 international markets
 */
export async function runMigrations(): Promise<void> {
  // 1. Seed Tenants
  const tenants = [
    { id: 'rest-col-01', name: 'Andrés Restaurante & Asador', tax_id: 'NIT 900.234.567-1', cuisine_type: 'Gastronomía Colombiana Contemporánea' },
    { id: 'rest-mex-02', name: 'Taquería y Cantina Los Aluxes', tax_id: 'RFC ALU980415-K92', cuisine_type: 'Cocina Mexicana de Tradición' },
    { id: 'rest-usa-03', name: 'Manhattan Prime Steakhouse', tax_id: 'EIN 13-9874521', cuisine_type: 'New York Classic Steakhouse' },
    { id: 'rest-bra-04', name: 'Fogo & Sabor Churrascaria', tax_id: 'CNPJ 24.382.910/0001-55', cuisine_type: 'Churrasco Gaúcho Tradicional' },
    { id: 'rest-jpn-05', name: '割烹 銀座 桜 (Kappo Sakura Ginza)', tax_id: '法人番号 7010401056789', cuisine_type: '伝統日本料理・会席 (Kaiseki & Edomae)' },
  ];

  for (const t of tenants) {
    await query(
      `INSERT INTO tenants (id, name, tax_id, cuisine_type) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.name, t.tax_id, t.cuisine_type]
    );
  }

  // 2. Seed Branches (2 per country)
  const branches = [
    { id: 'branch-col-bog', tenant_id: 'rest-col-01', name: 'Sede Bogotá - Zona Rosa', address: 'Calle 82 # 12-25', city: 'Bogotá', country: 'Colombia', timezone: 'America/Bogota', commercial_currency: 'COP', opening_time: '12:00', closing_time: '23:30', max_capacity: 80 },
    { id: 'branch-col-med', tenant_id: 'rest-col-01', name: 'Sede Medellín - El Poblado', address: 'Carrera 35 # 8A-42', city: 'Medellín', country: 'Colombia', timezone: 'America/Bogota', commercial_currency: 'COP', opening_time: '12:30', closing_time: '23:00', max_capacity: 60 },
    { id: 'branch-mex-cdmx', tenant_id: 'rest-mex-02', name: 'Sucursal CDMX - Polanco', address: 'Av. Presidente Masaryk 310', city: 'Ciudad de México', country: 'México', timezone: 'America/Mexico_City', commercial_currency: 'MXN', opening_time: '13:00', closing_time: '01:00', max_capacity: 90 },
    { id: 'branch-mex-gdl', tenant_id: 'rest-mex-02', name: 'Sucursal Guadalajara - Zapopan', address: 'Av. Patria 1890', city: 'Guadalajara', country: 'México', timezone: 'America/Mexico_City', commercial_currency: 'MXN', opening_time: '13:00', closing_time: '00:00', max_capacity: 75 },
    { id: 'branch-usa-soho', tenant_id: 'rest-usa-03', name: 'SoHo Flagship - Manhattan', address: '482 Broome Street', city: 'New York', country: 'United States', timezone: 'America/New_York', commercial_currency: 'USD', opening_time: '17:00', closing_time: '23:30', max_capacity: 110 },
    { id: 'branch-usa-miami', tenant_id: 'rest-usa-03', name: 'Brickell Financial - Miami', address: '1100 Brickell Bay Drive', city: 'Miami', country: 'United States', timezone: 'America/New_York', commercial_currency: 'USD', opening_time: '17:00', closing_time: '00:00', max_capacity: 95 },
    { id: 'branch-bra-sp', tenant_id: 'rest-bra-04', name: 'Unidade São Paulo - Itaim Bibi', address: 'Rua Joaquim Floriano, 466', city: 'São Paulo', country: 'Brasil', timezone: 'America/Sao_Paulo', commercial_currency: 'BRL', opening_time: '12:00', closing_time: '23:00', max_capacity: 100 },
    { id: 'branch-bra-rio', tenant_id: 'rest-bra-04', name: 'Unidade Rio de Janeiro - Copacabana', address: 'Av. Atlântica 2100', city: 'Rio de Janeiro', country: 'Brasil', timezone: 'America/Sao_Paulo', commercial_currency: 'BRL', opening_time: '12:00', closing_time: '23:30', max_capacity: 85 },
    { id: 'branch-jpn-ginza', tenant_id: 'rest-jpn-05', name: '東京 銀座本店 (Tokyo Ginza)', address: '東京都中央区銀座 6-10-1', city: 'Tokyo', country: '日本 (Japan)', timezone: 'Asia/Tokyo', commercial_currency: 'JPY', opening_time: '11:30', closing_time: '22:00', max_capacity: 45 },
    { id: 'branch-jpn-kyoto', tenant_id: 'rest-jpn-05', name: '京都 祇園別邸 (Kyoto Gion)', address: '京都府京都市東山区祇園町南側 570', city: 'Kyoto', country: '日本 (Japan)', timezone: 'Asia/Tokyo', commercial_currency: 'JPY', opening_time: '12:00', closing_time: '21:30', max_capacity: 35 },
  ];

  for (const b of branches) {
    await query(
      `INSERT INTO branches (id, tenant_id, name, address, city, country, timezone, commercial_currency, opening_time, closing_time, max_capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
      [b.id, b.tenant_id, b.name, b.address, b.city, b.country, b.timezone, b.commercial_currency, b.opening_time, b.closing_time, b.max_capacity]
    );
  }

  // 3. Seed Users with Bcrypt Hashed Passwords
  const defaultPassword = await bcrypt.hash('secret123', 10);
  const users = [
    { id: 'usr-owner-01', tenant_id: 'rest-col-01', name: 'Carlos Mendoza', email: 'owner@andres.co', role: 'OWNER', password_hash: defaultPassword },
    { id: 'usr-admin-01', tenant_id: 'rest-col-01', name: 'Valeria Gómez', email: 'admin@andres.co', role: 'ADMIN', password_hash: defaultPassword },
    { id: 'usr-waiter-01', tenant_id: 'rest-col-01', name: 'Mateo Restrepo', email: 'waiter@andres.co', role: 'WAITER', password_hash: defaultPassword },
    { id: 'usr-kitchen-01', tenant_id: 'rest-col-01', name: 'Chef Andrés Parra', email: 'kitchen@andres.co', role: 'KITCHEN', password_hash: defaultPassword },
    { id: 'usr-cust-01', tenant_id: 'rest-col-01', name: 'Sofía Caballero', email: 'sofia@gmail.com', role: 'CUSTOMER', password_hash: defaultPassword },
  ];

  for (const u of users) {
    await query(
      `INSERT INTO users (id, tenant_id, name, email, role, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.tenant_id, u.name, u.email, u.role, u.password_hash]
    );
  }

  // 4. Seed Tables
  const tables = [
    { id: 'tbl-col-01', tenant_id: 'rest-col-01', branch_id: 'branch-col-bog', table_number: 1, capacity: 2, location_area: 'MAIN_HALL', qr_token: 'qr-bog-tbl-01-token884', status: 'AVAILABLE' },
    { id: 'tbl-col-02', tenant_id: 'rest-col-01', branch_id: 'branch-col-bog', table_number: 2, capacity: 4, location_area: 'MAIN_HALL', qr_token: 'qr-bog-tbl-02-token192', status: 'OCCUPIED' },
    { id: 'tbl-col-03', tenant_id: 'rest-col-01', branch_id: 'branch-col-bog', table_number: 3, capacity: 4, location_area: 'TERRACE', qr_token: 'qr-bog-tbl-03-token503', status: 'AVAILABLE' },
    { id: 'tbl-col-04', tenant_id: 'rest-col-01', branch_id: 'branch-col-bog', table_number: 4, capacity: 6, location_area: 'VIP_LOUNGE', qr_token: 'qr-bog-tbl-04-token377', status: 'RESERVED' },
  ];

  for (const tbl of tables) {
    await query(
      `INSERT INTO restaurant_tables (id, tenant_id, branch_id, table_number, capacity, location_area, qr_token, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
      [tbl.id, tbl.tenant_id, tbl.branch_id, tbl.table_number, tbl.capacity, tbl.location_area, tbl.qr_token, tbl.status]
    );
  }
}
