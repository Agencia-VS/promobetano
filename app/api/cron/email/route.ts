import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { remitente, resendCliente, respuestaA } from "@/lib/resend";
import { plantilla, type TipoCorreo } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El lote entero se manda en una petición, pero la toma, el cierre y el rescate
// siguen siendo llamadas a la base: 10 s por defecto no alcanzan.
export const maxDuration = 60;

/*
 * 100 es el máximo que acepta la API de lotes de Resend, así que el tamaño del
 * lote y el de la petición coinciden por construcción. Subirlo obligaría a
 * partir el lote en varias peticiones y a decidir qué hacer si la segunda falla
 * después de que la primera salió.
 */
const LOTE = 100;

/**
 * Drenaje de la cola de correo.
 *
 * Lo llama Vercel Cron (ver vercel.json). El envío vive acá y no dentro del
 * request de inscripción por dos razones: la persona en el mall no debería
 * esperar a la API de un tercero, y un fallo del proveedor no debería costar
 * la inscripción entera cuando el correo se puede reintentar.
 *
 * La concurrencia la resuelve Postgres: tomar_lote_email usa `for update skip
 * locked`, así que dos corridas solapadas —o dos instancias serverless— toman
 * filas distintas en vez de mandar el mismo correo dos veces.
 */
export async function GET(request: NextRequest) {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    // Sin secreto configurado la ruta NO se abre: quedaría un endpoint público
    // capaz de vaciar la cola de correo a pedido de cualquiera.
    return NextResponse.json({ error: "sin_configurar" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${esperado}`) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const resend = resendCliente();
  const from = remitente();
  if (!supabase || !resend || !from) {
    return NextResponse.json({ error: "sin_configurar" }, { status: 503 });
  }

  // Primero se rescatan los que quedaron en 'enviando' porque la instancia
  // murió entre la toma del lote y el cierre. Sin esto se quedan colgados para
  // siempre y nadie recibe ese correo.
  await supabase.rpc("rescatar_emails_colgados");

  const { data: lote, error } = await supabase.rpc("tomar_lote_email", {
    lote: LOTE,
  });

  if (error) {
    console.error("tomar_lote_email falló:", error.message);
    return NextResponse.json({ error: "servidor" }, { status: 502 });
  }

  const filas = (lote ?? []) as Array<{
    id: number;
    tipo: TipoCorreo;
    nombre: string;
    email: string;
    /*
     * Instante del sorteo de la jornada a la que entró la persona. Viene de la
     * base y no del calendario de este proceso: el cron compone un correo para una
     * fila que se encoló antes, y recalcular la jornada con el reloj de ahora daría
     * la jornada equivocada para todo lo que quedó en la cola al pasar las 21:00.
     * Null en los sorteos ad-hoc sin ventana; la plantilla omite la línea.
     */
    sorteo_at: string | null;
  }>;

  if (filas.length === 0) {
    return NextResponse.json({ tomados: 0, enviados: 0, fallidos: 0 });
  }

  const piezas = filas.map((fila) => {
    const { asunto, html, texto } = plantilla(
      fila.tipo,
      fila.nombre,
      fila.sorteo_at ? new Date(fila.sorteo_at) : null,
    );
    return {
      from,
      to: fila.email,
      replyTo: respuestaA(),
      subject: asunto,
      html,
      text: texto,
    };
  });

  /*
   * Una petición para todo el lote, no cien.
   *
   * Antes iba en serie —cien envíos, uno tras otro— justamente para no chocar
   * con el límite de tasa de Resend, que devolvía 429 en masa. Pero con 9.000
   * confirmaciones esperadas en un día, cien peticiones en serie contra un
   * límite de 2 por segundo son unos 50 s, y el maxDuration es 60: el lote
   * quedaba a un pelo de cortarse por la mitad todos los minutos del pico.
   *
   * `permissive` y no la validación estricta por defecto: en estricta, UNA
   * dirección mal formada hace que el lote entero se rechace, y como esa fila
   * vuelve a la cola con las mismas 99 compañeras, un solo correo malo frena a
   * todos los demás en cada reintento. En permisiva la respuesta trae los
   * fallos con su índice y el resto sale.
   */
  const { data: envio, error: errLote } = await resend.batch.send(piezas, {
    batchValidation: "permissive",
  });

  if (errLote || !envio) {
    // La petición no llegó a procesarse: no salió ninguno. Vuelven a la cola
    // con su backoff, que es lo mismo que hacía el bucle fila por fila.
    const motivo = errLote?.message ?? "batch.send no devolvió respuesta";
    console.error("resend.batch.send falló:", motivo);
    await supabase.rpc("marcar_emails_error", {
      p_ids: filas.map((f) => f.id),
      p_error: motivo,
    });
    return NextResponse.json({
      tomados: filas.length,
      enviados: 0,
      fallidos: filas.length,
    });
  }

  const fallos = new Map<number, string>();
  for (const e of envio.errors ?? []) fallos.set(e.index, e.message);

  /*
   * El mapeo es POSICIONAL: `envio.data` trae un id por pieza que salió, en el
   * orden en que se enviaron, y los índices de las que no salieron vienen en
   * `errors`. Si las cuentas no cuadran, no hay forma de saber qué id
   * corresponde a qué fila, y adivinar tiene dos consecuencias malas: marcar
   * como enviada una que no salió (nadie recibe el correo) o cerrar una fila
   * con el id de proveedor de otra (el rebote se le atribuye a quien no fue).
   *
   * Así que no se cierra nada: las filas quedan en 'enviando' y
   * rescatar_emails_colgados las devuelve a la cola en 15 minutos. Puede
   * duplicar un correo, y es a propósito: es el mismo riesgo que ya se asume
   * cuando la instancia muere a mitad del lote, y es preferible a dejar sin
   * aviso a un ganador.
   */
  if (envio.data.length + fallos.size !== filas.length) {
    console.error(
      `resend.batch.send devolvió ${envio.data.length} ids y ${fallos.size} errores para ${filas.length} piezas. ` +
        "El lote queda sin cerrar y lo recupera rescatar_emails_colgados.",
    );
    return NextResponse.json({ error: "respuesta_inesperada" }, { status: 502 });
  }

  const idsOk: number[] = [];
  const proveedorOk: string[] = [];
  // Agrupados por mensaje: los fallos de un lote suelen compartir motivo, y así
  // el cierre son una o dos llamadas y no una por fila.
  const idsPorMotivo = new Map<string, number[]>();
  let cursor = 0;

  filas.forEach((fila, i) => {
    const motivo = fallos.get(i);
    if (motivo !== undefined) {
      const previos = idsPorMotivo.get(motivo);
      if (previos) previos.push(fila.id);
      else idsPorMotivo.set(motivo, [fila.id]);
      return;
    }
    idsOk.push(fila.id);
    proveedorOk.push(envio.data[cursor]?.id ?? "");
    cursor++;
  });

  if (idsOk.length > 0) {
    const { error: errOk } = await supabase.rpc("marcar_emails_enviados", {
      p_ids: idsOk,
      p_proveedor_ids: proveedorOk,
    });
    // Los correos ya salieron: si el cierre falla, lo peor que pasa es que
    // rescatar_emails_colgados los reintente. Se registra y no se aborta.
    if (errOk) console.error("marcar_emails_enviados falló:", errOk.message);
  }

  for (const [motivo, ids] of idsPorMotivo) {
    const { error: errMal } = await supabase.rpc("marcar_emails_error", {
      p_ids: ids,
      p_error: motivo,
    });
    if (errMal) console.error("marcar_emails_error falló:", errMal.message);
  }

  return NextResponse.json({
    tomados: filas.length,
    enviados: idsOk.length,
    fallidos: fallos.size,
  });
}
