/**
 * Server-side Supabase client — service role only.
 *
 * Runs exclusively in Node.js API routes (runtime = 'nodejs').
 * NEVER import this in Client Components or Edge functions.
 *
 * The service role key bypasses Row Level Security, which is what we
 * want for server-to-server auth operations. RLS on the users table
 * still blocks any unauthenticated direct access from the browser.
 *
 * @module lib/supabase/server
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
// Vercel's Supabase integration injects this as SUPABASE_SECRET_KEY.
// Fallback to the conventional name in case it's been manually added.
const key =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    '[Supabase] SUPABASE_URL or SUPABASE_SECRET_KEY is not set.\n' +
      'Get both values from:\n' +
      '  https://supabase.com/dashboard/project/xdkojaigrjhzjkqxguxh/settings/api\n' +
      'Add them to .env.local and to Vercel → Project Settings → Environment Variables.'
  );
}

/**
 * Singleton Supabase client for server-side operations.
 * Session handling is disabled — we manage our own JWT sessions via jose.
 */
export const supabase: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
