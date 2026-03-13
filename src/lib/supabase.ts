/**
 * Supabase singleton client — server-side only.
 *
 * Uses the SERVICE ROLE key so it bypasses Row Level Security.
 * The `server-only` import below enforces this at build time: Next.js will
 * throw a hard error if this module is ever accidentally imported into a
 * Client Component or a browser bundle.
 *
 * Environment variables (set in Vercel Dashboard, never committed):
 *   SUPABASE_URL          — e.g. https://xdkojaigrjhzjkqxguxh.supabase.co
 *   SUPABASE_SECRET_KEY   — service role secret (not the anon key)
 *
 * @module lib/supabase
 */

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) {
  throw new Error('[supabase] SUPABASE_URL is not set. Add it to Vercel Environment Variables.');
}
if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error('[supabase] SUPABASE_SECRET_KEY is not set. Add it to Vercel Environment Variables.');
}

// Global singleton — reused across invocations in the same warm serverless instance.
let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        // Server-side: sessions are managed via jose JWTs in HttpOnly cookies.
        // Disable Supabase Auth helpers to avoid confusion with our own session layer.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  return _client;
}
