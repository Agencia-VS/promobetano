import { Resend } from "resend";

/**
 * Cliente de Resend, perezoso y único.
 *
 * Perezoso porque construirlo en el nivel de módulo obligaría a tener
 * RESEND_API_KEY presente en cualquier proceso que importe este archivo,
 * incluidas las pruebas y el build. Único porque el cron drena hasta 100 correos
 * por corrida y crear un cliente —con su pool de conexiones— por cada request
 * tira a la basura el keep-alive entre lotes.
 *
 * Devuelve `null` en vez de lanzar cuando falta configuración: quien llama
 * decide si eso es un 503 o un aviso, y en el arranque del proyecto es normal
 * que todavía no esté puesta.
 */

let cliente: Resend | null = null;
let claveDelCliente: string | null = null;

export function resendCliente(): Resend | null {
  const clave = process.env.RESEND_API_KEY?.trim();
  if (!clave) return null;

  // Si la clave cambia —rotación, o un test que la mueve— hay que rehacer el
  // cliente: el de antes seguiría autenticando con la vieja.
  if (!cliente || claveDelCliente !== clave) {
    cliente = new Resend(clave);
    claveDelCliente = clave;
  }
  return cliente;
}

/** Remitente configurado, ya recortado. `null` si falta. */
export function remitente(): string | null {
  return process.env.RESEND_FROM?.trim() || null;
}

/** A dónde van las respuestas de quien le da «responder». */
export function respuestaA(): string | undefined {
  return process.env.RESEND_REPLY_TO?.trim() || undefined;
}
