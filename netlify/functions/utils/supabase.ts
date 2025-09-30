// This file is for server-side Supabase Admin initialization.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and Service Role Key must be provided in server-side environment variables.");
}

// The service role key has admin privileges and bypasses Row Level Security.
// NEVER expose this key on the client side.
export const supabase = createClient(supabaseUrl, supabaseKey);
