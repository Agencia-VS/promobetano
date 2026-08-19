import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { conSesion, errorRpc } from "@/lib/admin";
import { TAG_INTERRUPTOR } from "@/lib/concurso-servidor";

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

  // El interruptor se lee cacheado —costaba ~120 ms en cada vista pública—, así
  // que sin esto abrir o cerrar desde el panel tardaría hasta medio minuto en
  // notarse. Con la invalidación, el cambio manual sigue siendo inmediato.
  //
  // `expire: 0` y no el perfil "max" que la doc recomienda: "max" sirve lo
  // caducado mientras refresca por detrás, y eso significa que la primera
  // persona que entre después de cerrar a mano vería el concurso abierto. Acá
  // se prefiere que esa petición espere.
  revalidateTag(TAG_INTERRUPTOR, { expire: 0 });

  return NextResponse.json({ abiertas: data ?? null });
});
