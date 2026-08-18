/**
 * Puerta 18+ (marca de apuestas: obligatoria, no decorativa).
 *
 * La confirmación vive en una cookie httpOnly verificada en el servidor por
 * proxy.ts, no en sessionStorage. La versión anterior era un overlay que se
 * saltaba con Tab+Enter (el CTA quedaba antes en el orden del DOM, sin focus
 * trap), no existía en /inscripcion ni /listo, quedaba fuera de pantalla en
 * viewports cortos, y se volvía imposible de cerrar si el navegador bloqueaba
 * el almacenamiento. Además el servidor nunca sabía que se había respondido,
 * así que no había nada auditable.
 */
export const COOKIE_EDAD = "edc_18_ok";
export const RUTAS_CON_PUERTA = ["/i", "/inscripcion", "/listo"] as const;

/** 30 días: la declaración de edad no debería repetirse en cada visita. */
export const EDAD_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Sanea el destino post-puerta. Sin esto, ?next=https://otro-sitio convierte
 * la puerta en un redirector abierto con la marca Betano delante.
 */
export function destinoSeguro(next: string | null | undefined): string {
  if (!next) return "/i";
  if (!next.startsWith("/") || next.startsWith("//")) return "/i";
  if (!/^\/[A-Za-z0-9/_\-?=&.%]*$/.test(next)) return "/i";
  return next;
}
