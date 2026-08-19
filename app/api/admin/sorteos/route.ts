import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Listado de sorteos con sus recuentos y el resultado de la verificación. */
export const GET = conSesion(async ({ supabase }) => {
  const { data, error } = await supabase.rpc("listar_sorteos");
  if (error) return errorRpc(error.message);
  return NextResponse.json({ sorteos: data ?? [] });
});

/**
 * Crea un sorteo en BORRADOR. No lo ejecuta: son dos pasos a propósito, para
 * que revisar los parámetros y disparar el azar sean decisiones separadas.
 *
 * La semilla la genera la base, no este handler ni el navegador: tiene que
 * quedar registrada antes de ejecutar para que el resultado sea reproducible.
 */
export const POST = conSesion(async ({ supabase, request }) => {
  const c = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
  const nGanadores = Number(c.n_ganadores);
  const nSuplentes = Number(c.n_suplentes);

  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  }
  if (!Number.isInteger(nGanadores) || nGanadores < 1) {
    return NextResponse.json(
      { error: "Los ganadores tienen que ser un entero de 1 o más." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(nSuplentes) || nSuplentes < 0) {
    return NextResponse.json(
      { error: "Los suplentes tienen que ser un entero de 0 o más." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("crear_sorteo", {
    p_nombre: nombre,
    p_n_ganadores: nGanadores,
    p_n_suplentes: nSuplentes,
    p_ventana_desde: (c.ventana_desde as string) || null,
    p_ventana_hasta: (c.ventana_hasta as string) || null,
  });

  if (error) return errorRpc(error.message);
  return NextResponse.json({ id: data }, { status: 201 });
});
