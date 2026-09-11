import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Missing Supabase server environment variables.");
}

// Server-side client used by protected API routes.
export const supabaseServer = createClient(
  supabaseUrl,
  supabaseSecretKey
);