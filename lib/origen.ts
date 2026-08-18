/**
 * Atribución por panel (el ?p= del QR).
 *
 * Dos cambios de fondo respecto de la primera versión:
 *
 * 1. El nombre visible sale de una lista blanca, no de manipular el slug.
 *    Derivarlo con split("-").slice(0,-1) truncaba malls reales ("costanera"
 *    → "Panel por definir", "parque-arauco" → "Parque") y, como el slug viene
 *    crudo de la URL, permitía que /i?p=retira-tu-premio-ahora-01 mostrara
 *    texto elegido por un tercero dentro de una página con marca Betano.
 *
 * 2. El valor por defecto NO es un panel real. Antes el tráfico sin ?p= se
 *    acreditaba a parque-arauco-01, arruinando justamente la medición que el
 *    ?p= existe para responder.
 */

export const ORIGEN_DIRECTO = "directo";
export const COOKIE_ORIGEN = "edc_origen";

/** proxy.ts resuelve el origen y lo pasa a las páginas por este header. */
export const HEADER_ORIGEN = "x-edc-origen";

/** TODO(§Qué falta 05): completar con los paneles reales antes de imprimir los QR. */
const PANELES: Record<string, string> = {
  "parque-arauco-01": "Parque Arauco",
};

/** Nombre para mostrar, o null si el slug no corresponde a un panel conocido. */
export function nombrePanel(slug: string): string | null {
  return PANELES[slug] ?? null;
}

/** Etiqueta para la UI; nunca refleja el slug crudo. */
export function etiquetaPanel(slug: string): string {
  return nombrePanel(slug) ?? "Panel por definir";
}

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
