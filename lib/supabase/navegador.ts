"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente del navegador. Solo lo usa la pantalla de login: es el único punto
 * donde el cliente necesita hablar con Supabase Auth directamente para que la
 * sesión quede escrita en las cookies que después lee proxy.ts.
 */
let cliente: SupabaseClient | null = null;

export function supabaseNavegador(): SupabaseClient | null {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) return null;
  cliente = createBrowserClient(url, clave);
  return cliente;
}
