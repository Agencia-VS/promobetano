import { NextResponse } from "next/server";
import { conSesion } from "@/lib/admin";
import { plantilla, type TipoCorreo } from "@/lib/email";
import { remitente, resendCliente, respuestaA } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un envío con reintento del proveedor puede pasarse de los 10 s por defecto.
export const maxDuration = 30;

const TIPOS: TipoCorreo[] = ["ganador"];

/**
 * Envía una de las dos plantillas a una dirección, para revisarla de verdad.
 *
 * Una plantilla de correo no se puede dar por buena mirándola en el navegador:
 * Gmail descarta el `<style>` del cuerpo, Outlook ignora media queries, y el
 * modo oscuro de cada cliente recolorea a su gusto. La única prueba que vale es
 * abrir el correo en el cliente donde lo va a abrir la gente.
 *
 * ── Por qué este SÍ se envía dentro del request ─────────────────────────────
 *
 * La regla del proyecto es que ningún correo se manda dentro de una petición: se
 * encola en `email_outbox` y lo drena el cron. Esa regla existe por dos motivos
 * que acá no aplican: que la persona en el mall no espere a Resend, y que una
 * caída de Resend no se lleve la inscripción por delante.
 *
 * Acá no hay inscripción que perder y quien espera es alguien del equipo mirando
 * la pantalla, que necesita saber AHORA si el correo salió o si el remitente está
 * mal configurado. Encolarlo obligaría a esperar al cron para descubrir que la
 * clave estaba mal, y a inventar una fila de `inscripciones` para colgarle la
 * fila de la cola.
 *
 * Justamente por eso esta ruta NO TOCA la base: no escribe en `inscripciones`, no
 * encola nada y no consume el índice único de la cola. Una prueba no puede
 * ensuciar el sorteo ni gastarle a nadie su correo de confirmación.
 */
export const POST = conSesion(async ({ request, usuario }) => {
  const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const email = typeof cuerpo.email === "string" ? cuerpo.email.trim() : "";
  const tipo = cuerpo.tipo as TipoCorreo;
  const nombre =
    typeof cuerpo.nombre === "string" && cuerpo.nombre.trim()
      ? cuerpo.nombre.trim()
      : "Ana Pérez";

  // Comprobación deliberadamente laxa: es una dirección de prueba del equipo, y
  // el error de verdad lo devuelve el proveedor. Lo que importa es no llamar a
  // Resend con una cadena vacía.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Escribe una dirección de correo válida." },
      { status: 400 },
    );
  }
  if (!TIPOS.includes(tipo)) {
    return NextResponse.json(
      { error: `El tipo tiene que ser uno de: ${TIPOS.join(", ")}.` },
      { status: 400 },
    );
  }

  const resend = resendCliente();
  const from = remitente();
  if (!resend || !from) {
    /*
     * 503 y con el detalle puesto: si falta la clave o el remitente, saberlo es
     * justamente el resultado útil de la prueba. Sin este mensaje, el equipo
     * concluiría que la plantilla está rota.
     */
    return NextResponse.json(
      {
        error: "sin_configurar",
        detalle:
          "Faltan RESEND_API_KEY o RESEND_FROM. Cárgalas antes de probar el envío.",
      },
      { status: 503 },
    );
  }

  // #001 es parte del contenido de prueba; no toca el contador real.
  const { asunto, html, texto } = plantilla(tipo, nombre, null, 1);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: email,
      replyTo: respuestaA(),
      // El asunto va marcado: sin esto, un correo de ganador de prueba en la
      // bandeja de alguien del equipo es indistinguible de uno real, y ya hubo
      // sustos así en otras campañas.
      subject: `[PRUEBA] ${asunto}`,
      html,
      text: texto,
    });

    if (error) throw new Error(error.message);

    console.log(
      `Correo de prueba «${tipo}» enviado a ${email} por ${usuario.email ?? usuario.id}`,
    );
    return NextResponse.json({
      ok: true,
      proveedor_id: data?.id ?? null,
    });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("El correo de prueba falló:", detalle);
    return NextResponse.json({ error: "envio", detalle }, { status: 502 });
  }
});
