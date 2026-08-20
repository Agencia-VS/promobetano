import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Encola los correos de ganador del sorteo: el batch manual por jornada.
 *
 * No envía nada acá (regla dura 8): mete las filas en `email_outbox` y el cron
 * las drena en el minuto siguiente. La RPC cubre a ganadores y promovidos
 * vigentes, y la restricción única de la cola hace inofensivo un segundo clic:
 * quien ya tiene el correo encolado o enviado no lo recibe de nuevo.
 */
export const POST = conSesion(async ({ supabase, usuario, params }) => {
  const { data, error } = await supabase.rpc("encolar_correos_ganadores", {
    p_sorteo_id: Number(params.id),
    p_actor: usuario.id,
  });
  if (error) return errorRpc(error.message);
  return NextResponse.json({ encolados: data ?? 0 });
});
