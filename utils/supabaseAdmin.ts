import { createClient } from '@supabase/supabase-js';

// Validasi environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// Client untuk operasi server-side dengan service role
export const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);