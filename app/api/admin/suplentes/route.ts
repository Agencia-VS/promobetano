import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Promueve al primer suplente disponible cuando un ganador declina.
 *
 * Toda la cascada la resuelve Postgres en una transacción con la fila
 * bloqueada. Calcularla en el navegador del admin —como hacía el repo
 * anterior— permite que dos promociones simultáneas asciendan al MISMO
 * suplente y dejen un premio sin dueño.
 */
export const POST = conSesion(async ({ supabase, usuario, request }) => {
  const c = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const resultadoId = Number(c.resultado_id);

  if (!Number.isInteger(resultadoId)) {
    return NextResponse.json({ error: "Falta resultado_id." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("promover_suplente", {
    p_resultado_id: resultadoId,
    p_motivo: typeof c.motivo === "string" ? c.motivo.trim() || null : null,
    p_actor: usuario.id,
  });

  if (error) return errorRpc(error.message);
  return NextResponse.json({ cambio: Array.isArray(data) ? data[0] : data });
});
