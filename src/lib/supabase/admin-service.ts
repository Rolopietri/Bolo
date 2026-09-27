// Cliente Supabase con service-role, SOLO para el servidor (endpoints de
// administración). Salta RLS, así que jamás debe importarse en el navegador.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
