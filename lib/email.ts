import { MARCA } from "./marca.ts";
import { CORREO_DATOS } from "./contacto.ts";
import { urlAbsoluta } from "./sitio.ts";

/**
 * Plantillas de correo.
 *
 * Tabuladas y con estilos inline: Gmail descarta <style> en el cuerpo y Outlook
 * ignora buena parte de flexbox y grid, así que una maqueta moderna llega rota
 * justo al cliente de correo que más usa la gente. Una tabla de un ancho fijo
 * es lo único que se ve igual en todos.
 *
 * Los colores salen de MARCA, nunca de un hex escrito acá. Es la regla dura 14:
 * el repo anterior tenía una paleta paralela para el correo y acabó con tres
 * naranjas distintos que la misma persona veía en la misma sesión.
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

const TIPOGRAFIA = "Helvetica,Arial,sans-serif";

/*
 * Las fuentes de campaña no viajan al correo. Gmail ignora @font-face por
 * completo y los demás lo soportan a medias, así que pedir MD Nichrome acabaría
 * en una sustitución impredecible por cliente. Helvetica en todos es peor de
 * mirar pero igual en todas partes, y en un correo transaccional eso importa
 * más. La marca la ponen el color, el isotipo y el lockup.
 */

/**
 * Las imágenes solo se emiten si hay dominio configurado. Sin él, `urlAbsoluta`
 * devuelve null y la plantilla se salta la fila entera: un correo sin logo se
 * lee bien, uno con iconos de imagen rota no.
 *
 * `alt` no es decorativo: buena parte de la gente lee el correo con las imágenes
 * bloqueadas por defecto, y el alt es lo único que verán ahí.
 */
function imagen(
  ruta: string,
  alt: string,
  anchoMostrado: number,
  estiloExtra = "",
): string {
  const src = urlAbsoluta(ruta);
  if (!src) return "";
  return `<img src="${src}" alt="${escapaHtml(alt)}" width="${anchoMostrado}" style="display:block;width:${anchoMostrado}px;max-width:100%;height:auto;border:0;${estiloExtra}">`;
}

/** Cabecera oscura con el isotipo. La B es roja con el rayo calado: sobre el
    ink se lee, sobre el naranja de campaña se pierde.
    El color del <td> es para el alt: con las imágenes bloqueadas el texto de
    reemplazo hereda el color de la celda, y en negro sobre negro no se veía. */
function cabecera(): string {
  const iso = imagen("/email/iso-96.png", "Betano", 48);
  if (!iso) return "";
  return `<tr><td style="padding:22px 28px;background:${MARCA.ink};font-family:${TIPOGRAFIA};font-size:13px;color:${MARCA.bone};">${iso}</td></tr>`;
}

/** Pie legal. Las dos frases son obligatorias en toda pieza de la campaña. */
function pie(): string {
  return `<tr><td style="padding:20px 28px 24px;background:${MARCA.ink};color:rgba(249,241,233,.72);font-family:${TIPOGRAFIA};font-size:12px;line-height:1.55;">
Solo mayores de 18 años. Juega con responsabilidad.<br>
Consultas sobre tus datos: <a href="mailto:${CORREO_DATOS}" style="color:${MARCA.bone};">${CORREO_DATOS}</a>
</td></tr>`;
}

const PIE_TEXTO = `Solo mayores de 18 años. Juega con responsabilidad.
Consultas sobre tus datos: ${CORREO_DATOS}`;

/**
 * El preheader es el texto que el cliente de correo muestra en la bandeja
 * después del asunto. Sin uno explícito, muestra el primer texto del cuerpo,
 * que suele ser "Ver en el navegador" o el alt de un logo.
 *
 * Las dos <meta> de color-scheme frenan la inversión automática del modo oscuro
 * de Gmail y Outlook. Sin ellas esos clientes reinterpretan la paleta por su
 * cuenta —el naranja de campaña sobre todo— y el correo llega con colores que
 * nadie eligió.
 */
function documento(preheader: string, tabla: string): string {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background:${MARCA.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapaHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MARCA.ink};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
${tabla}
</table>
</td></tr></table>
</body></html>`;
}

/** Molde sobrio: cabecera oscura, tarjeta naranja, pie oscuro. Lo usan la
    confirmación y los avisos de suplente. */
function envoltorio(preheader: string, contenido: string): string {
  return documento(
    preheader,
    `${cabecera()}
<tr><td style="background:${MARCA.confianza};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${contenido}
</table>
</td></tr>
${pie()}`,
  );
}

const PASOS_HTML = `<p style="margin:0 0 6px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${MARCA.white};">Si te lo ganas, así se usa</p>
<p style="margin:0;font-size:15px;line-height:1.7;color:${MARCA.white};">01 · Abre la botella.<br>02 · Susúrrate: «tú puedes».<br>03 · Échate bastante y con confianza.</p>`;

const PASOS_TEXTO = `Si te lo ganas, así se usa:
01 · Abre la botella.
02 · Susúrrate: «tú puedes».
03 · Échate bastante y con confianza.`;

export function plantilla(tipo: TipoCorreo, nombre: string): Plantilla {
  const quien = escapaHtml(primerNombre(nombre));
  const quienTexto = primerNombre(nombre);

  if (tipo === "confirmacion") {
    return {
      asunto: "Recibimos tu inscripción — Eau de Confianza",
      html: envoltorio(
        "Recibimos tu inscripción. Si sales sorteado te escribimos acá mismo.",
        `<tr><td style="padding:32px 28px 4px;">
${imagen("/email/lockup-600.png", "Eau de Confianza · Riquelme + Betano", 240)}
</td></tr>
<tr><td style="padding:20px 28px 8px;font-family:${TIPOGRAFIA};">
<h1 style="margin:0;font-size:26px;line-height:1.15;text-transform:uppercase;color:${MARCA.white};">Recibimos tu inscripción, ${quien}</h1>
</td></tr>
<tr><td style="padding:12px 28px 32px;font-family:${TIPOGRAFIA};">
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MARCA.white};">Quedaste en el sorteo. Si sales sorteado, te escribimos a este mismo correo.</p>
${PASOS_HTML}
</td></tr>`,
      ),
      texto: `Recibimos tu inscripción, ${quienTexto}.

Quedaste en el sorteo. Si sales sorteado, te escribimos a este mismo correo.

${PASOS_TEXTO}

${PIE_TEXTO}`,
    };
  }

  if (tipo === "ganador" || tipo === "promovido") {
    return ganaste(tipo, quien, quienTexto);
  }

  /*
   * Suplente. Se queda escueto a propósito: cuántos suplentes hay, en qué orden
   * entran y con qué plazo son las decisiones 03 y 04 del brief, que siguen
   * abiertas. Prometer acá un número o un plazo inventado es exactamente lo que
   * no se puede hacer en un correo con efectos legales.
   */
  return {
    asunto: "Quedaste como suplente — Eau de Confianza",
    html: envoltorio(
      "Quedaste como suplente. Si se libera un cupo, te avisamos acá mismo.",
      `<tr><td style="padding:32px 28px 4px;">
${imagen("/email/lockup-600.png", "Eau de Confianza · Riquelme + Betano", 240)}
</td></tr>
<tr><td style="padding:20px 28px 32px;font-family:${TIPOGRAFIA};">
<h1 style="margin:0 0 14px;font-size:26px;line-height:1.15;text-transform:uppercase;color:${MARCA.white};">Quedaste como suplente, ${quien}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:${MARCA.white};">No saliste sorteado esta vez, pero quedaste en la lista de suplentes. Si se libera un cupo te escribimos a este mismo correo.</p>
</td></tr>`,
    ),
    texto: `Quedaste como suplente, ${quienTexto}.

No saliste sorteado esta vez, pero quedaste en la lista de suplentes. Si se libera un cupo te escribimos a este mismo correo.

${PIE_TEXTO}`,
  };
}

/**
 * El correo de ganador rompe el molde a propósito: naranja de campaña de lado a
 * lado, titular grande y el lockup debajo. Es la única pieza del sistema que da
 * una buena noticia, y al abrirla tiene que notarse antes de leer una palabra
 * que no es otra confirmación de trámite.
 *
 * `promovido` comparte maqueta porque es la misma noticia —se liberó un cupo y
 * es tuyo— y solo cambia cómo se llegó a ella.
 *
 * No se nombra el premio, ni un plazo, ni una forma de entrega: las decisiones
 * 03 y 04 del brief siguen abiertas. El correo dice lo único que se sabe con
 * certeza, que es que el equipo va a contactar.
 */
function ganaste(
  tipo: "ganador" | "promovido",
  quien: string,
  quienTexto: string,
): Plantilla {
  const promovido = tipo === "promovido";
  const entradilla = promovido
    ? "Se liberó un cupo y quedó para ti."
    : "Saliste sorteado.";

  return {
    asunto: promovido
      ? "¡Se liberó un cupo y es tuyo! — Eau de Confianza"
      : "¡Felicidades, ganaste! — Eau de Confianza",
    html: documento(
      `${entradilla} El equipo se contactará contigo para la entrega.`,
      `${cabecera()}
<tr><td align="center" style="padding:44px 28px 36px;background:${MARCA.confianza};font-family:${TIPOGRAFIA};text-align:center;">

<p style="margin:0 0 14px;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${MARCA.white};">${escapaHtml(entradilla)}</p>

<h1 style="margin:0 0 18px;font-size:38px;line-height:1.05;text-transform:uppercase;color:${MARCA.white};">¡Felicidades,<br>ganaste!</h1>

<p style="margin:0 0 30px;font-size:16px;line-height:1.6;color:${MARCA.white};">${quien}, el equipo se contactará contigo para gestionar la entrega de los premios.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 26px;">
${imagen("/email/lockup-600.png", "Eau de Confianza · Riquelme + Betano", 260, "margin:0 auto;")}
</td></tr></table>

<p style="margin:0;font-size:14px;line-height:1.75;color:${MARCA.white};">Abre la botella.<br>Susúrrate: «tú puedes».<br>Échate bastante y con confianza.</p>

</td></tr>
${pie()}`,
    ),
    texto: `¡Felicidades, ganaste!

${entradilla} ${quienTexto}, el equipo se contactará contigo para gestionar la entrega de los premios.

Abre la botella.
Susúrrate: «tú puedes».
Échate bastante y con confianza.

${PIE_TEXTO}`,
  };
}
