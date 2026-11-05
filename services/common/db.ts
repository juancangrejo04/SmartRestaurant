// Database Access Layer — Exclusively Backed by Supabase PostgreSQL
import { getSupabaseAdminClient, getSupabaseClient, isSupabaseConfigured } from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

let customDbClient: any = null;

/**
 * Allows injecting a test database client during automated unit/integration testing.
 */
export function setTestDb(client: any): void {
  customDbClient = client;
}

/**
 * Returns the Supabase Admin Client.
 * Throws a fatal error if credentials are not configured, ensuring no business
 * mutation reports success without real database persistence.
 */
export function getDb(): SupabaseClient {
  if (customDbClient) {
    return customDbClient as SupabaseClient;
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error(
      'DATABASE_UNAVAILABLE: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in environment variables.'
    );
  }
  return client;
}

/**
 * Validates Supabase connectivity.
 * Note: Database migrations in Supabase are versioned and managed via supabase/migrations/
 */
export async function runMigrations(): Promise<void> {
  const client = getSupabaseAdminClient();
  if (client) {
    const { error } = await client.from('tenants').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.warn('[Supabase Connection Notice]:', error.message);
    }
  }
}

export { getSupabaseAdminClient, getSupabaseClient, isSupabaseConfigured };
