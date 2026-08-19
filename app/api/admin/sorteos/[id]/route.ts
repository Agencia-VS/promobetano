import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resultados de un sorteo, con los datos de contacto de cada persona. */
export const GET = conSesion(async ({ supabase, params }) => {
  const { data, error } = await supabase.rpc("listar_resultados", {
    p_sorteo_id: Number(params.id),
  });
  if (error) return errorRpc(error.message);
  return NextResponse.json({ resultados: data ?? [] });
});

/**
 * Ejecuta el sorteo.
 *
 * El doble clic es inofensivo por construcción: la RPC reclama el sorteo con un
 * UPDATE condicional sobre el estado 'borrador', así que la segunda llamada no
 * encuentra fila que actualizar y aborta sin tocar nada. No hace falta un
 * candado en el navegador, que además no serviría con dos pestañas abiertas.
 */
export const POST = conSesion(async ({ supabase, usuario, params }) => {
  const { data, error } = await supabase.rpc("ejecutar_sorteo", {
    p_sorteo_id: Number(params.id),
    p_actor: usuario.id,
  });

  if (error) return errorRpc(error.message);

  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ resumen: fila });
});
