import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { conSesion, errorRpc } from "@/lib/admin";
import { TAG_INTERRUPTOR } from "@/lib/concurso-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Enciende o apaga el ensayo en producción.
 *
 * No es lo mismo que «Abrir ahora» del interruptor. Abrir a mano deja el sitio
 * aceptando inscripciones, pero fuera de la ventana del concurso ninguna
 * jornada cubre el instante y la base rechaza cada alta con `sin_jornada`:
 * `inscripciones.sorteo_id` es not null y lo resuelve un trigger. `abrir_pruebas`
 * crea esa jornada —encajada entre las reales, sin tocar ni una de ellas— y de
 * paso marca el modo, que es lo que hace aparecer el aviso en el formulario.
 *
 * Apagar devuelve el interruptor al calendario y cierra la ventana de ensayo,
 * pero NO borra nada: limpiar es otra decisión y tiene su propia ruta.
 */
export const POST = conSesion(async ({ supabase, usuario, request }) => {
  const cuerpo = (await request.json().catch(() => ({}))) as {
    abrir?: unknown;
  };

  if (cuerpo.abrir !== true && cuerpo.abrir !== false) {
    return NextResponse.json(
      { error: "abrir debe ser true o false" },
      { status: 400 },
    );
  }

  const { data, error } = cuerpo.abrir
    ? await supabase.rpc("abrir_pruebas", { p_actor: usuario.id })
    : await supabase.rpc("cerrar_pruebas", { p_actor: usuario.id });

  if (error) return errorRpc(error.message);

  // El estado público se lee cacheado: sin invalidar, el aviso del formulario
  // podría tardar hasta medio minuto en aparecer —o en irse—, y el ensayo se
  // enciende justo para mirar el formulario ahora.
  revalidateTag(TAG_INTERRUPTOR, { expire: 0 });

  console.log(
    `Modo pruebas ${cuerpo.abrir ? "abierto" : "cerrado"} por ${usuario.email ?? usuario.id}`,
  );

  return NextResponse.json({
    abierto: cuerpo.abrir,
    jornada: Array.isArray(data) ? (data[0] ?? null) : (data ?? null),
  });
});
