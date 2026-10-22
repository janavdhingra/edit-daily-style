import { createClient } from '@supabase/supabase-js';

// The publishable key is meant to ship in the browser; row-level security in
// supabase/migrations decides what each user can read and write.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key ? createClient(url, key) : null;
