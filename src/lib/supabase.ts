/**
 * Supabase singleton client — server-side only.
 *
 * Uses the SERVICE ROLE key so it bypasses Row Level Security.
 * This file must NEVER be imported from client components.
 *
 * Environment variables (set in Vercel Dashboard, never committed):
 *   SUPABASE_URL          — e.g. https://xdkojaigrjhzjkqxguxh.supabase.co
 *   SUPABASE_SECRET_KEY   — service role secret (not the anon key)
 *
 * @module lib/supabase
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) {
  throw new Error('[supabase] SUPABASE_URL is not set. Add it to Vercel Environment Variables.');
}
if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error('[supabase] SUPABASE_SECRET_KEY is not set. Add it to Vercel Environment Variables.');
}

// Global singleton — reused across invocations in the same warm instance.
let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        // Server-side: we manage sessions ourselves via jose JWTs.
        // Disable Supabase's built-in auth helpers to avoid confusion.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  return _client;
}
