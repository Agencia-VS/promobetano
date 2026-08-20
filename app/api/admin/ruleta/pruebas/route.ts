import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edita el simulador sin tocar ninguna configuración ni ventana real. */
export const POST = conSesion(async ({ supabase, usuario, request }) => {
  const cuerpo = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const n = entero(cuerpo.n);
  const modo = cuerpo.modo;
  const desde = fechaLocal(cuerpo.ventana_desde);
  const hasta = fechaLocal(cuerpo.ventana_hasta);

  if (
    n === null ||
    n < 1 ||
    n > 10000 ||
    (modo !== "automatico" && modo !== "manual") ||
    desde === null ||
    hasta === null
  ) {
    return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  }

  const { error } = await supabase.rpc("configurar_ruleta_pruebas", {
    p_modo: modo,
    p_n: n,
    // El navegador entrega hora local; Postgres aplica las reglas históricas
    // de America/Santiago para esa fecha.
    p_ventana_desde: desde,
    p_ventana_hasta: hasta,
    p_actor: usuario.id,
  });

  if (error) return errorRpc(error.message);
  return NextResponse.json({ ok: true });
});

function entero(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) ? n : null;
}

/** `datetime-local` estricto, sin aceptar fechas normalizadas por JavaScript. */
function fechaLocal(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    return null;
  }
  const d = new Date(`${v}:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 16) === v
    ? v
    : null;
}
