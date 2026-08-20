import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";
import { jornadas, problemasCalendario } from "@/lib/concurso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sincroniza las jornadas de la base con el calendario del entorno.
 *
 * El calendario NO viene en el cuerpo de la petición: se arma acá, en el
 * servidor, desde `lib/concurso.ts`. Es la diferencia entre «las fechas están en
 * un solo sitio» y «las fechas están donde las escribió el navegador»: un campo
 * de fecha en el panel produce cadenas sin offset —lo que da un
 * `<input type="datetime-local">`— y Postgres las interpreta en el huso de la
 * sesión, que en Supabase es UTC. El límite de la jornada se correría cuatro
 * horas y nadie lo vería hasta después de sortear.
 *
 * Es idempotente: la RPC crea lo que falta, actualiza lo que sigue en borrador y
 * se niega a tocar lo ya ejecutado. Apretar el botón dos veces no hace nada la
 * segunda vez.
 */
export const POST = conSesion(async ({ supabase, usuario }) => {
  const problemas = problemasCalendario();
  const lista = jornadas();

  /*
   * Un calendario con problemas no se sincroniza. Cargar «lo que se entienda»
   * dejaría ventanas incompletas en la base, y una ventana incompleta no es un
   * error visible: es gente inscribiéndose sin entrar a ningún sorteo.
   */
  if (lista.length === 0) {
    return NextResponse.json(
      {
        error: "calendario_invalido",
        detalle:
          problemas[0] ??
          "El calendario de sorteos no está cargado: revisa CONCURSO_SORTEOS.",
        problemas,
      },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("cargar_jornadas", {
    p_jornadas: lista.map((j, i) => ({
      // Clave posicional y no por fecha: si el cliente mueve el horario, esto
      // ACTUALIZA la jornada en vez de crear una cuarta al lado de la vieja.
      clave: `jornada-${i + 1}`,
      nombre: j.nombre,
      desde: j.desde.toISOString(),
      hasta: j.sorteoAt.toISOString(),
      n_ganadores: j.nGanadores,
      n_suplentes: j.nSuplentes,
    })),
    p_actor: usuario.id,
  });

  if (error) return errorRpc(error.message);

  // `problemas` puede traer avisos que no impiden cargar —una zona muerta al
  // final, por ejemplo—, así que viajan aunque la carga haya salido bien.
  return NextResponse.json({ jornadas: data ?? [], problemas });
});
