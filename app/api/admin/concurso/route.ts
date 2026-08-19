import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Acciona el interruptor manual de inscripciones.
 *
 * `abiertas` acepta tres valores y los tres importan:
 *   true   → abre aunque el calendario diga que no
 *   false  → cierra aunque el calendario diga que sí
 *   null   → devuelve el control al calendario
 */
export const POST = conSesion(async ({ supabase, usuario, request }) => {
  const cuerpo = (await request.json().catch(() => ({}))) as {
    abiertas?: unknown;
  };

  const v = cuerpo.abiertas;
  if (v !== true && v !== false && v !== null) {
    return NextResponse.json(
      { error: "abiertas debe ser true, false o null" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("set_inscripciones", {
    p_abiertas: v,
    p_actor: usuario.id,
  });

  if (error) return errorRpc(error.message);
  return NextResponse.json({ abiertas: data ?? null });
});
