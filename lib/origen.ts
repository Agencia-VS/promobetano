/**
 * Atribución por panel (el ?p= del QR).
 *
 * El slug se guarda para MEDIR, no para mostrarse. Ninguna vista lo imprime:
 * la portada nombra la sede, que es un dato de la campaña y no de la URL. Es
 * deliberado por dos razones que ya costaron un arreglo cada una:
 *
 * 1. El slug viene crudo de la URL, así que reflejarlo dejaba que
 *    /i?p=retira-tu-premio-ahora-01 pusiera texto elegido por un tercero dentro
 *    de una página con marca Betano. La lista blanca que lo contenía dejó de
 *    hacer falta cuando el texto pasó a ser fijo.
 *
 * 2. El valor por defecto NO es un panel real. Antes el tráfico sin ?p= se
 *    acreditaba a parque-arauco-01, arruinando justamente la medición que el
 *    ?p= existe para responder.
 */

export const ORIGEN_DIRECTO = "directo";
export const COOKIE_ORIGEN = "edc_origen";

/** proxy.ts resuelve el origen y lo pasa a las páginas por este header. */
export const HEADER_ORIGEN = "x-edc-origen";

/**
 * Un slug se acepta para REGISTRO (aunque no esté en la lista blanca todavía,
 * para no perder la atribución de un panel recién impreso) solo si tiene forma
 * de slug: minúsculas, dígitos y guiones simples, acotado en largo.
 */
export function slugValido(slug: string): boolean {
  return slug.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Normaliza el ?p= a un slug registrable, o al sentinela "directo". */
export function normalizaOrigen(raw: string | string[] | undefined): string {
  const primero = Array.isArray(raw) ? raw.find((s) => s.trim() !== "") : raw;
  const slug = (primero ?? "").trim().toLowerCase();
  return slug && slugValido(slug) ? slug : ORIGEN_DIRECTO;
}
