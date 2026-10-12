import { createClient } from '@supabase/supabase-js';

const supabseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
}

export const supabase = createClient(supabseUrl, supabaseServiceKey);