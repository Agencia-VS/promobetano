import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { conSesion, errorRpc } from "@/lib/admin";
import { TAG_INTERRUPTOR } from "@/lib/concurso-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cambia modo, N y ventana de una jornada. El N en curso queda congelado. */
export const POST = conSesion(async ({ supabase, usuario, request }) => {
  const cuerpo = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const sorteoId = entero(cuerpo.sorteo_id);
  const n = entero(cuerpo.n);
  const modo = cuerpo.modo;
  const desde = fechaLocal(cuerpo.ventana_desde);
  const hasta = fechaLocal(cuerpo.ventana_hasta);

  if (
    sorteoId === null ||
    n === null ||
    n < 1 ||
    n > 10000 ||
    (modo !== "automatico" && modo !== "manual") ||
    desde === null ||
    hasta === null
  ) {
    return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  }

  const { error } = await supabase.rpc("configurar_ruleta", {
    p_sorteo_id: sorteoId,
    p_modo: modo,
    p_n: n,
    // Son horas locales sin offset a propósito: la RPC las interpreta en
    // America/Santiago, incluida la regla de horario de verano de esa fecha.
    p_ventana_desde: desde,
    p_ventana_hasta: hasta,
    p_actor: usuario.id,
  });

  if (error) return errorRpc(error.message);

  // Las ventanas ahora deciden el estado público automático.
  revalidateTag(TAG_INTERRUPTOR, { expire: 0 });
  return NextResponse.json({ ok: true });
});

function entero(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) ? n : null;
}

/** `datetime-local` estricto y calendario real, sin aceptar normalizaciones. */
function fechaLocal(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    return null;
  }
  const d = new Date(`${v}:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 16) === v
    ? v
    : null;
}
