// Supabase PostgreSQL Client for SmartRestaurant Serverless Architecture
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let cachedAdminClient: SupabaseClient | null = null;
let cachedAnonClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_URL.startsWith('http') &&
    (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)
  );
}

/**
 * Returns the Supabase Admin Client using SUPABASE_SERVICE_ROLE_KEY.
 * Used exclusively in server-side API routes / serverless functions to perform trusted business mutations,
 * transactional outbox staging, and cross-tenant aggregations with RLS bypass.
 * NEVER exposed to the frontend or public web.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!cachedAdminClient) {
    const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    cachedAdminClient = createClient(SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return cachedAdminClient;
}

/**
 * Returns the public Supabase Client using SUPABASE_ANON_KEY.
 * Safe for client-side or anon-scoped queries subject to Row Level Security (RLS).
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured() || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (!cachedAnonClient) {
    cachedAnonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
      },
    });
  }
  return cachedAnonClient;
}

/**
 * Supabase Health Check & Diagnostic Status
 */
export async function checkSupabaseHealth(): Promise<{
  configured: boolean;
  connected: boolean;
  url: string;
  message: string;
}> {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      connected: false,
      url: SUPABASE_URL ? 'Partially configured' : 'Not set',
      message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set in environment variables. Operating in resilient fallback mode.',
    };
  }

  try {
    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error('Could not instantiate Supabase client');
    const { data, error } = await admin.from('tenants').select('count', { count: 'exact', head: true });
    if (error) {
      return {
        configured: true,
        connected: false,
        url: SUPABASE_URL,
        message: `Supabase error: ${error.message}`,
      };
    }
    return {
      configured: true,
      connected: true,
      url: SUPABASE_URL,
      message: `Connected successfully to Supabase PostgreSQL (${data ?? 0} tenants).`,
    };
  } catch (err: any) {
    return {
      configured: true,
      connected: false,
      url: SUPABASE_URL,
      message: err.message,
    };
  }
}
