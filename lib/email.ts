import { MARCA } from "./marca.ts";
import { diaSorteo } from "./concurso.ts";
import { urlAbsoluta } from "./sitio.ts";

/**
 * Plantillas de correo.
 *
 * Tabuladas y con estilos inline: Gmail descarta <style> en el cuerpo y Outlook
 * ignora buena parte de flexbox y grid, así que una maqueta moderna llega rota
 * justo al cliente de correo que más usa la gente. Una tabla de un ancho fijo
 * es lo único que se ve igual en todos.
 *
 * La composición es editorial sobre fondo oscuro: manda el negro cálido de
 * campaña y el naranja aparece una sola vez, como acento. Es el registro que
 * pide el brief —un anuncio de fragancia que resulta ser de una casa de
 * apuestas— y en un teléfono cansa mucho menos la vista que un naranja saturado
 * a pantalla completa, que es lo que había antes.
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

export type TipoCorreo = "confirmacion" | "ganador";

type Plantilla = { asunto: string; html: string; texto: string };

const TIPOGRAFIA = "Helvetica,Arial,sans-serif";

/*
 * Las fuentes de campaña no viajan al correo. Gmail ignora @font-face por
 * completo y los demás lo soportan a medias, así que pedir MD Nichrome acabaría
 * en una sustitución impredecible por cliente. Helvetica en todos es peor de
 * mirar pero igual en todas partes, y en un correo transaccional eso importa
 * más. El display de campaña viaja donde sí puede: dentro del lockup.
 */

/** Hueso a media opacidad para el cuerpo. Sobre el ink, el hueso puro compite
    con el titular y aplana la jerarquía. */
const CUERPO = "rgba(249,241,233,.82)";

/**
 * Las imágenes solo se emiten si hay dominio configurado. Sin él, `urlAbsoluta`
 * devuelve null y la plantilla se salta la fila entera: un correo sin logo se
 * lee bien, uno con iconos de imagen rota no.
 *
 * `alt` no es decorativo: buena parte de la gente lee el correo con las imágenes
 * bloqueadas por defecto, y el alt es lo único que verán ahí. Por eso el lockup
 * nunca lleva información que no esté también en el texto.
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

/**
 * Cabecera: el lockup centrado con aire. Es la única pieza del display de
 * campaña que puede viajar a un correo, así que carga sola con la identidad.
 *
 * El `color` del <td> es para el alt: con las imágenes bloqueadas el texto de
 * reemplazo hereda el color de la celda, y sobre el ink en negro no se veía.
 */
function cabecera(): string {
  const lockup = imagen(
    "/email/lockup-600.png",
    "Eau de Confianza · Riquelme + Betano",
    230,
    "margin:0 auto;",
  );
  if (!lockup) return "";
  return `<tr><td class="e-cab" align="center" style="padding:16px 32px 34px;font-family:${TIPOGRAFIA};font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:${MARCA.bone};">${lockup}</td></tr>`;
}

/** Hilo de separación. Un borde sobre una celda vacía es la regla horizontal
    más portable que existe: <hr> lo estilan distinto todos los clientes. */
function hilo(): string {
  return `<tr><td class="e-hilo" style="padding:0 32px;"><div style="height:1px;background:${MARCA.rust};line-height:1px;font-size:0;">&nbsp;</div></td></tr>`;
}

/** Pie legal. Las dos frases son obligatorias en toda pieza de la campaña. */
function pie(): string {
  return `<tr><td class="e-pie" style="padding:22px 32px 8px;font-family:${TIPOGRAFIA};font-size:12px;line-height:1.6;color:rgba(249,241,233,.6);">
Solo mayores de 18 años. Juega con responsabilidad.
</td></tr>`;
}

const PIE_TEXTO = "Solo mayores de 18 años. Juega con responsabilidad.";

/**
 * Antetítulo: versalitas con tracking ancho, en naranja. Es el recurso que en
 * el sitio marca las etiquetas de sección (tracking 0.18–0.42em según el brief)
 * y acá da el primer escalón de la jerarquía.
 */
function antetitulo(texto: string): string {
  return `<p style="margin:0 0 14px;font-size:10.5px;letter-spacing:.3em;text-transform:uppercase;color:${MARCA.confianza};">${escapaHtml(texto)}</p>`;
}

/** Titular. `color` cambia según la pieza: hueso para las informativas, naranja
    para la que da la buena noticia. */
function titular(texto: string, color: string): string {
  return `<h1 class="e-h1" style="margin:0;font-size:30px;line-height:1.1;letter-spacing:.02em;text-transform:uppercase;color:${color};">${texto}</h1>`;
}

/**
 * Bloque de los pasos del perfume: el único campo naranja de la pieza.
 *
 * Sobre el naranja el texto va en blanco puro —es lo que dice el token del
 * brief— y los numerales bajan a 70% para que se lean como numeración y no
 * compitan con la instrucción.
 *
 * El encabezado lo pone cada pieza: «Si te lo ganas» en la confirmación, donde
 * todavía no se ganó nada, y «Te lo ganaste» en el correo de ganador. Un «si te
 * lo ganas» en el correo que da la buena noticia leería el premio como
 * hipótesis, y eso en una pieza con efectos legales no se puede.
 */
function pasosHtml(encabezado: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MARCA.confianza};border-radius:8px;">
<tr><td class="e-pasos" style="padding:22px 24px;font-family:${TIPOGRAFIA};">
<p style="margin:0 0 14px;font-size:10.5px;letter-spacing:.28em;text-transform:uppercase;color:rgba(255,255,255,.75);">${escapaHtml(encabezado)}</p>
<p style="margin:0;font-size:15.5px;line-height:1.85;color:${MARCA.white};">
<span style="color:rgba(255,255,255,.6);">01</span>&nbsp;&nbsp;Abre la botella.<br>
<span style="color:rgba(255,255,255,.6);">02</span>&nbsp;&nbsp;Susúrrate: «tú puedes».<br>
<span style="color:rgba(255,255,255,.6);">03</span>&nbsp;&nbsp;Échate bastante y con confianza.
</p>
</td></tr></table>`;
}

function pasosTexto(encabezado: string): string {
  return `${encabezado}:
01  Abre la botella.
02  Susúrrate: «tú puedes».
03  Échate bastante y con confianza.`;
}

/**
 * Envoltorio común.
 *
 * El preheader es el texto que el cliente de correo muestra en la bandeja
 * después del asunto. Sin uno explícito, muestra el primer texto del cuerpo,
 * que suele ser "Ver en el navegador" o el alt de un logo.
 *
 * Las dos <meta> de color-scheme frenan la inversión automática del modo oscuro
 * de Gmail y Outlook. Sin ellas esos clientes reinterpretan la paleta por su
 * cuenta —el naranja de campaña sobre todo— y el correo llega con colores que
 * nadie eligió.
 *
 * El <style> con la media query es el ÚNICO ajuste para pantalla angosta que
 * un correo puede hacer. Gmail lo respeta; Outlook de escritorio ignora las
 * media queries, pero es un cliente ancho, así que quedarse con la base inline
 * es justo lo correcto ahí. Por eso los estilos inline son la versión segura y
 * la media query solo aprieta: si un cliente la descarta, no se rompe nada.
 */
function documento(preheader: string, filas: string): string {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<style>
@media only screen and (max-width:480px){
  .e-marco{padding:24px 12px !important}
  .e-cab{padding:8px 22px 26px !important}
  .e-cuerpo{padding:24px 22px 26px !important}
  .e-pie{padding:20px 22px 8px !important}
  .e-pasos{padding:20px 20px !important}
  .e-h1{font-size:25px !important}
  .e-hilo{padding:0 22px !important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${MARCA.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapaHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MARCA.ink};">
<tr><td class="e-marco" align="center" style="padding:44px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
${filas}
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Molde de las dos piezas: lockup, hilo, contenido, hilo, pie legal. Lo que
 * cambia entre correos es el bloque central, no la estructura — así las dos se
 * reconocen como la misma familia.
 */
function pieza(preheader: string, contenido: string): string {
  return documento(
    preheader,
    `${cabecera()}
${hilo()}
<tr><td class="e-cuerpo" style="padding:30px 32px 32px;font-family:${TIPOGRAFIA};">
${contenido}
</td></tr>
${hilo()}
${pie()}`,
  );
}

/**
 * `sorteoAt` es el instante del sorteo de la jornada a la que entró la persona.
 *
 * Importa decirlo desde que hay tres sorteos: quien se inscribe el viernes a las
 * 21:30 entra al del SÁBADO, y sin esta línea se queda esperando un resultado que
 * no le corresponde. Es opcional porque puede no haberlo —un sorteo ad-hoc sin
 * ventana— y entonces la frase se omite en vez de inventar una fecha, igual que
 * las imágenes cuando falta el dominio.
 */
export function plantilla(
  tipo: TipoCorreo,
  nombre: string,
  sorteoAt?: Date | null,
  numeroGanador?: number | null,
  numeroPrueba?: number | null,
): Plantilla {
  const quien = escapaHtml(primerNombre(nombre));
  const quienTexto = primerNombre(nombre);

  if (tipo === "confirmacion") {
    // El correo se abre horas después y puede que otro día, así que el día va
    // absoluto: un "hoy" en un correo no significa nada. Y va el día sin hora,
    // porque quien se inscribe el día X entra al sorteo del día X y eso es todo
    // lo que necesita saber.
    const cuando = sorteoAt ? `Entras al sorteo del ${diaSorteo(sorteoAt)}. ` : "";
    return {
      asunto: "Recibimos tu inscripción — Eau de Confianza",
      html: pieza(
        `${cuando}Si ganas, nos comunicaremos contigo.`,
        `${antetitulo("Inscripción confirmada")}
${titular(`Recibimos tu inscripción, ${quien}`, MARCA.bone)}
<p style="margin:18px 0 28px;font-size:16px;line-height:1.65;color:${CUERPO};">${cuando}Si ganas, nos comunicaremos contigo.</p>
${pasosHtml("Si te lo ganas, así se usa")}`,
      ),
      texto: `Recibimos tu inscripción, ${quienTexto}.

${cuando}Si ganas, nos comunicaremos contigo.

${pasosTexto("Si te lo ganas, así se usa")}

${PIE_TEXTO}`,
    };
  }

  return ganaste(quien, quienTexto, numeroGanador, numeroPrueba);
}

/**
 * La buena noticia.
 *
 * Comparte maqueta con la confirmación —misma familia— pero pone el titular en
 * naranja en vez de hueso. Sobre el ink da 5,6:1 de contraste, así que pasa AA
 * incluso como texto normal, y usa el acento de campaña tipográficamente en
 * lugar de como campo de color. Es lo que hace que el correo se sienta distinto
 * al abrirlo sin necesitar una segunda maqueta.
 *
 * Es deliberadamente breve: la prueba principal es la pantalla física y este
 * mensaje es solo el respaldo. El folio tiene que coincidir con la lista
 * impresa 1..90.
 */
function ganaste(
  quien: string,
  quienTexto: string,
  numeroGanador?: number | null,
  numeroPrueba?: number | null,
): Plantilla {
  const esPrueba =
    typeof numeroPrueba === "number" &&
    Number.isInteger(numeroPrueba) &&
    numeroPrueba >= 1;
  const folio = esPrueba
    ? `PRUEBA ${numeroPrueba}`
    : typeof numeroGanador === "number" && Number.isInteger(numeroGanador)
      ? `#${String(numeroGanador).padStart(3, "0")}`
      : null;
  const etiquetaFolio = esPrueba ? "Número de prueba" : "Número de ganador";
  const bloqueFolio = folio
    ? `<div style="margin:26px 0;padding:18px 20px;background:${MARCA.bone};color:${MARCA.ink};border-radius:4px;">
<span style="display:block;margin-bottom:5px;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;">${etiquetaFolio}</span>
<strong style="font-size:38px;line-height:1;letter-spacing:.08em;">${folio}</strong>
</div>`
    : "";
  const lineaFolio = folio ? `\n${etiquetaFolio}: ${folio}.` : "";
  const retiro = `si aún no has retirado tu premio, acércate al stand de premiación y presenta tu ${etiquetaFolio.toLowerCase()}.`;
  const omision = "Si ya retiraste tu premio, puedes omitir este correo.";
  const retiroHtml = `${quien}, ${retiro}`;
  const retiroTexto = `${quienTexto}, ${retiro}`;
  const preheader = `¡Confiaste y ganaste! ${folio ? `Tu número es ${folio}. ` : ""}${omision}`;

  return {
    asunto: "¡Confiaste y ganaste! — Eau de Confianza",
    // Respaldo deliberadamente plano: sin lockup, tablas, antetítulo ni pasos
    // del perfume. La pantalla física es la prueba principal; este correo solo
    // repite la instrucción y el correlativo por si la persona lo necesita.
    html: `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background:${MARCA.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapaHtml(preheader)}</div>
<div style="max-width:520px;margin:0 auto;padding:40px 24px;font-family:${TIPOGRAFIA};color:${MARCA.bone};">
<h1 style="margin:0;font-size:30px;line-height:1.12;color:${MARCA.confianza};">¡Confiaste y ganaste!</h1>
<p style="margin:20px 0 0;font-size:16px;line-height:1.65;color:${CUERPO};">${retiroHtml}</p>
${bloqueFolio}
<p style="margin:0;font-size:15px;line-height:1.6;color:${CUERPO};">${omision}</p>
<p style="margin:32px 0 0;padding-top:20px;border-top:1px solid ${MARCA.rust};font-size:12px;line-height:1.6;color:rgba(249,241,233,.6);">
Solo mayores de 18 años. Juega con responsabilidad.
</p>
</div>
</body></html>`,
    texto: `¡Confiaste y ganaste!

${retiroTexto}${lineaFolio}

${omision}

${PIE_TEXTO}`,
  };
}
