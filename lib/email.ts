import { MARCA } from "./marca.ts";
import { CORREO_DATOS } from "./contacto.ts";

/**
 * Plantillas de correo.
 *
 * Tabuladas y con estilos inline: Gmail descarta <style> en el cuerpo y Outlook
 * ignora buena parte de flexbox y grid, así que una maqueta moderna llega rota
 * justo al cliente de correo que más usa la gente. Una tabla de un ancho fijo
 * es lo único que se ve igual en todos.
 */

/** Escapa lo que viene del usuario. Un nombre con `<` rompía la maqueta y era
    una vía de inyección en el cliente de correo. */
export function escapaHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Primer nombre, para el saludo. "Ana María Pérez" → "Ana". */
export function primerNombre(nombre: string): string {
  const primero = nombre.trim().split(/\s+/)[0] ?? "";
  return primero || "hola";
}

export type TipoCorreo = "confirmacion" | "ganador" | "suplente" | "promovido";

type Plantilla = { asunto: string; html: string; texto: string };

/**
 * El preheader es el texto que el cliente de correo muestra en la bandeja
 * después del asunto. Sin uno explícito, muestra el primer texto del cuerpo,
 * que suele ser "Ver en el navegador" o el alt de un logo.
 */
function envoltorio(preheader: string, contenido: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${MARCA.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapaHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MARCA.ink};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${MARCA.confianza};">
${contenido}
<tr><td style="padding:22px 28px;background:${MARCA.ink};color:rgba(249,241,233,.7);font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;">
Solo mayores de 18 años. Juega con responsabilidad.<br>
Consultas sobre tus datos: <a href="mailto:${CORREO_DATOS}" style="color:${MARCA.bone};">${CORREO_DATOS}</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function plantilla(tipo: TipoCorreo, nombre: string): Plantilla {
  const quien = escapaHtml(primerNombre(nombre));

  if (tipo === "confirmacion") {
    return {
      asunto: "Quedaste dentro — Eau de Confianza",
      html: envoltorio(
        "Tu inscripción quedó registrada. Te avisamos si sales sorteado.",
        `<tr><td style="padding:36px 28px 8px;font-family:Helvetica,Arial,sans-serif;">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${MARCA.white};">Eau de Confianza</p>
<h1 style="margin:0;font-size:26px;line-height:1.15;text-transform:uppercase;color:${MARCA.white};">Quedaste dentro, ${quien}</h1>
</td></tr>
<tr><td style="padding:14px 28px 32px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${MARCA.white};">
<p style="margin:0 0 18px;">Tu inscripción quedó registrada. Si sales sorteado, te escribimos a este mismo correo.</p>
<p style="margin:0 0 6px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;">Si te lo ganas, así se usa</p>
<p style="margin:0;">01 · Abre la botella.<br>02 · Susúrrate: «tú puedes».<br>03 · Échate bastante y con confianza.</p>
</td></tr>`,
      ),
      texto: `Quedaste dentro, ${primerNombre(nombre)}.

Tu inscripción quedó registrada. Si sales sorteado, te escribimos a este mismo correo.

Si te lo ganas, así se usa:
01 · Abre la botella.
02 · Susúrrate: «tú puedes».
03 · Échate bastante y con confianza.

Solo mayores de 18 años. Juega con responsabilidad.
Consultas sobre tus datos: ${CORREO_DATOS}`,
    };
  }

  /*
   * Los correos de resultado quedan deliberadamente escuetos: su contenido
   * depende de las decisiones 03 y 04 del brief —qué se gana, si hay canje
   * presencial y con qué plazo— que siguen abiertas. Prometer acá un plazo o
   * una forma de entrega inventada es exactamente lo que no se puede hacer en
   * un correo con efectos legales.
   */
  const titulos: Record<Exclude<TipoCorreo, "confirmacion">, string> = {
    ganador: "Saliste sorteado",
    suplente: "Quedaste como suplente",
    promovido: "Se liberó un cupo y es tuyo",
  };
  const titulo = titulos[tipo as Exclude<TipoCorreo, "confirmacion">];

  return {
    asunto: `${titulo} — Eau de Confianza`,
    html: envoltorio(
      `${titulo}. Te contactamos con los pasos a seguir.`,
      `<tr><td style="padding:36px 28px 32px;font-family:Helvetica,Arial,sans-serif;">
<h1 style="margin:0 0 14px;font-size:26px;line-height:1.15;text-transform:uppercase;color:${MARCA.white};">${escapaHtml(titulo)}, ${quien}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:${MARCA.white};">Te vamos a contactar por este mismo correo con los pasos para recibir tu premio.</p>
</td></tr>`,
    ),
    texto: `${titulo}, ${primerNombre(nombre)}.

Te vamos a contactar por este mismo correo con los pasos para recibir tu premio.

Solo mayores de 18 años. Juega con responsabilidad.
Consultas sobre tus datos: ${CORREO_DATOS}`,
  };
}
