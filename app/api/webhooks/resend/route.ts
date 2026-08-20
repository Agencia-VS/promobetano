import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resendCliente } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de Resend: rebotes, quejas y entregas.
 *
 * Sin esta ruta el ciclo quedaba abierto por los dos extremos. `email_outbox`
 * guardaba el id del proveedor de cada envío y la RPC `registrar_evento_email`
 * estaba escrita para casar un rebote con su inscripción y propagarlo a todas
 * las filas de esa dirección, pero nadie la llamaba: `inscripciones.email_estado`
 * se quedaba en 'pendiente' para siempre. La consecuencia no era cosmética —la
 * exclusión del pool por 'email_invalido' que hace `ejecutar_sorteo` no excluía a
 * nadie, así que una dirección que rebotó podía ganar un premio que después no
 * había forma de notificar, y las bases (§5) declaran justamente lo contrario.
 *
 * La firma la verifica el SDK con `webhooks.verify`, que implementa el esquema
 * de firmas de Resend. Se usa eso y no una comprobación a mano ni el paquete
 * `svix`: es el mismo cliente que ya está instalado para enviar.
 */

/** Los eventos que mueven el estado. El resto —abierto, click, programado— no
    dice nada sobre si la dirección sirve, y la RPC ya los ignora. */
const EVENTOS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export async function POST(request: NextRequest) {
  const secreto = process.env.RESEND_WEBHOOK_SECRET;
  if (!secreto) {
    // Sin secreto no se puede distinguir un evento de Resend de uno fabricado,
    // y esta ruta marca direcciones como inservibles: dejar entrar lo que
    // llegue permitiría sacar del sorteo a quien alguien quisiera. Igual que el
    // cron: sin configurar, cerrada.
    return NextResponse.json({ error: "sin_configurar" }, { status: 503 });
  }

  const resend = resendCliente();
  const supabase = supabaseAdmin();
  if (!resend || !supabase) {
    return NextResponse.json({ error: "sin_configurar" }, { status: 503 });
  }

  // El cuerpo CRUDO, sin pasar por JSON.parse: la firma se calcula sobre los
  // bytes exactos que llegaron, y volver a serializar el objeto cambia el
  // espaciado y el orden de las claves, con lo que ninguna firma cuadraría.
  const cuerpo = await request.text();
  const cabecera = (nombre: string) =>
    request.headers.get(`svix-${nombre}`) ??
    request.headers.get(`webhook-${nombre}`) ??
    "";

  let evento;
  try {
    evento = resend.webhooks.verify({
      payload: cuerpo,
      headers: {
        id: cabecera("id"),
        timestamp: cabecera("timestamp"),
        signature: cabecera("signature"),
      },
      webhookSecret: secreto,
    });
  } catch (e) {
    console.error(
      "webhook de Resend con firma inválida:",
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json({ error: "firma_invalida" }, { status: 401 });
  }

  const nombre = EVENTOS[evento.type];
  if (!nombre) {
    // 200 y no 4xx: el evento es legítimo, simplemente no nos sirve. Un error
    // acá haría que Resend lo reintentara en vano y, si se repite, que
    // deshabilite el endpoint entero —incluidos los rebotes, que sí importan—.
    return NextResponse.json({ ok: true, ignorado: evento.type });
  }

  const datos = evento.data as { email_id?: string } | undefined;
  const proveedorId = datos?.email_id;
  if (!proveedorId) {
    console.error(`webhook ${evento.type} sin email_id: no hay a qué fila casarlo.`);
    return NextResponse.json({ ok: true, ignorado: "sin_email_id" });
  }

  const { error } = await supabase.rpc("registrar_evento_email", {
    p_proveedor_id: proveedorId,
    p_evento: nombre,
  });

  if (error) {
    // 502 a propósito: Resend reintenta, y un rebote que no se registró es
    // alguien que sigue en el pool del sorteo del día siguiente.
    console.error("registrar_evento_email falló:", error.message);
    return NextResponse.json({ error: "servidor" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, evento: nombre });
}
