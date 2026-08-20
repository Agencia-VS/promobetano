import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Borra los datos de prueba.
 *
 * Es la única ruta del proyecto que borra inscripciones, y por eso el alcance
 * no lo decide este archivo: la RPC solo alcanza filas marcadas `es_prueba` y se
 * niega a tocar las que quedaron dentro de un sorteo real ya ejecutado, cuyo
 * pool y cuyo complemento están congelados para poder auditarlos. Acá no hay
 * ningún parámetro que ensanche eso, a propósito.
 *
 * Se registra quién la disparó en el log del servidor: el borrado no deja
 * rastro en la auditoría del sorteo —se va con él— así que el rastro tiene que
 * quedar en alguna parte.
 */
export const POST = conSesion(async ({ supabase, usuario }) => {
  const { data, error } = await supabase.rpc("purgar_pruebas", {
    p_actor: usuario.id,
  });

  if (error) return errorRpc(error.message);

  const resumen = (Array.isArray(data) ? data[0] : data) ?? null;

  console.log(
    `Datos de prueba borrados por ${usuario.email ?? usuario.id}:`,
    JSON.stringify(resumen),
  );

  return NextResponse.json({ resumen });
});
