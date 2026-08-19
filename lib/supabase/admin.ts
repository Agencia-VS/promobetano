import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave secreta: SALTA RLS POR COMPLETO.
 *
 * Solo puede usarse desde el servidor y solo en dos lugares:
 *   · el cron de drenaje de la cola, protegido por CRON_SECRET;
 *   · rutas de /api/admin/**, y ahí únicamente después de verificar la sesión
 *     con supabase.auth.getUser() en el mismo handler (regla dura 1 y 2).
 *
 * Nunca en una ruta pública. Si algún día aparece un import de este archivo en
 * un componente de cliente, la compilación debe fallar antes que el despliegue
 * salga: por eso lee una variable sin prefijo NEXT_PUBLIC_, que en el bundle
 * del navegador llega como undefined.
 */
let cliente: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secreta) return null;

  cliente = createClient(url, secreta, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
