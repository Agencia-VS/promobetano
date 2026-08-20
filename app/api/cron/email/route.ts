import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { remitente, resendCliente, respuestaA } from "@/lib/resend";
import { plantilla, type TipoCorreo } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un lote de 100 con reintentos puede pasarse de los 10 s por defecto.
export const maxDuration = 60;

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

  let enviados = 0;
  let fallidos = 0;

  /*
   * En serie y no con Promise.all: 100 envíos simultáneos chocan con el límite
   * de tasa de Resend y devuelven 429 en masa, con lo que el lote entero se
   * marca en error y vuelve a la cola. En serie el lote tarda más pero llega.
   */
  for (const fila of filas) {
    const { asunto, html, texto } = plantilla(
      fila.tipo,
      fila.nombre,
      fila.sorteo_at ? new Date(fila.sorteo_at) : null,
    );
    try {
      const { data, error: errEnvio } = await resend.emails.send({
        from,
        to: fila.email,
        replyTo: respuestaA(),
        subject: asunto,
        html,
        text: texto,
      });

      if (errEnvio) throw new Error(errEnvio.message);

      await supabase.rpc("marcar_email_enviado", {
        p_id: fila.id,
        // El id del proveedor es lo que después permite casar un rebote con la
        // inscripción que lo originó.
        p_proveedor_id: data?.id ?? "",
      });
      enviados++;
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      await supabase.rpc("marcar_email_error", {
        p_id: fila.id,
        p_error: motivo,
      });
      fallidos++;
    }
  }

  return NextResponse.json({ tomados: filas.length, enviados, fallidos });
}
