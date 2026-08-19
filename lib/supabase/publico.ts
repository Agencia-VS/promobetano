import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave publicable, para el único camino de escritura anónimo:
 * la RPC public.crear_inscripcion.
 *
 * NO usa la clave secreta. La regla dura 2 del brief la reserva para después
 * de una verificación de sesión exitosa en la misma función, y la ruta de alta
 * es anónima por definición: cualquiera con el QR entra sin sesión. Lo que
 * autoriza a esta clave es exactamente una función, porque RLS está encendida
 * sin políticas y el EXECUTE de todo lo demás está revocado para anon.
 */
let cliente: SupabaseClient | null = null;

export function supabasePublico(): SupabaseClient | null {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Sin configurar se devuelve null y la ruta responde 503, en vez de
  // construir un cliente que falla con un error de red críptico en cada alta.
  if (!url || !clave) return null;

  cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
