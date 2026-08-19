import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con sesión por cookies, para componentes de servidor y handlers de
 * ruta bajo /admin y /api/admin.
 *
 * Usa la clave PUBLICABLE, no la secreta. La sesión del usuario es lo que
 * autoriza: con RLS encendida y el EXECUTE concedido solo a `authenticated`,
 * este cliente puede invocar las RPC del panel únicamente si hay una sesión
 * válida. Un cliente con la clave secreta saltaría RLS y haría que la
 * autorización dependiera de que el handler se acuerde de verificarla.
 */
export async function supabaseServidor(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) return null;

  const jar = await cookies();

  return createServerClient(url, clave, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(aEscribir) {
        try {
          for (const { name, value, options } of aEscribir) {
            jar.set(name, value, options as CookieOptions);
          }
        } catch {
          // Un componente de servidor no puede escribir cookies. No es un
          // error: proxy.ts ya refrescó la sesión antes de llegar acá, así que
          // el token que se intenta persistir es el mismo que ya viaja en la
          // petición.
        }
      },
    },
  });
}

/**
 * Devuelve el usuario autenticado, o null.
 *
 * Se usa `getUser()` y NUNCA `getSession()`: getSession lee la cookie y confía
 * en su contenido sin verificar la firma, así que un token fabricado a mano
 * pasaría. getUser lo valida contra el servidor de Supabase.
 */
export async function usuarioAdmin() {
  const supabase = await supabaseServidor();
  if (!supabase) return { supabase: null, usuario: null };
  const { data } = await supabase.auth.getUser();
  return { supabase, usuario: data.user ?? null };
}
