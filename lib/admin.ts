import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { usuarioAdmin } from "./supabase/servidor.ts";

/**
 * Envoltorio de las rutas de /api/admin.
 *
 * La verificación corre DENTRO del handler, no en el matcher del proxy. El
 * matcher es una lista que hay que acordarse de mantener: la próxima ruta que
 * alguien agregue con otro prefijo quedaría abierta, y el descuido no
 * aparecería en el diff de esa ruta sino en un archivo de configuración que
 * nadie está mirando (regla dura 1).
 *
 * Devuelve 401 sin detalle: distinguir "no hay sesión" de "la sesión expiró"
 * no le sirve a nadie salvo a quien esté probando credenciales.
 */
export function conSesion(
  handler: (ctx: {
    supabase: SupabaseClient;
    usuario: User;
    request: Request;
    params: Record<string, string>;
  }) => Promise<Response>,
) {
  return async (
    request: Request,
    contexto?: { params?: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const { supabase, usuario } = await usuarioAdmin();

    if (!supabase) {
      return NextResponse.json({ error: "sin_configurar" }, { status: 503 });
    }
    if (!usuario) {
      return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
    }

    const params = (await contexto?.params) ?? {};

    try {
      return await handler({ supabase, usuario, request, params });
    } catch (e) {
      // El detalle va al log del servidor, no a la respuesta: un mensaje de
      // Postgres describe la estructura de la base a quien lo lea.
      console.error("Error en ruta de admin:", e);
      return NextResponse.json({ error: "servidor" }, { status: 500 });
    }
  };
}

/** Traduce un error de RPC a una respuesta, sin filtrar el mensaje crudo. */
export function errorRpc(mensaje: string): NextResponse {
  console.error("RPC falló:", mensaje);
  return NextResponse.json({ error: "rpc", detalle: mensaje }, { status: 400 });
}
