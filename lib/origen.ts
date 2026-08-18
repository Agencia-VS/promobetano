export const ORIGEN_DEFAULT = "parque-arauco-01";
const COOKIE_KEY = "edc_origen";

/** «parque-arauco-01» → «Parque Arauco» — nombre legible del panel para la portada. */
export function origenNombre(slug: string): string {
  const nombre = slug
    .split("-")
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return nombre || "Panel por definir";
}

/**
 * El ?p= del QR se guarda en cookie para que sobreviva a la navegación entre
 * /i y /inscripcion sin depender de que el usuario no cierre la pestaña
 * (brief §Reglas del formulario móvil: "?p= persistido en cookie").
 */
export function guardaOrigen(slug: string) {
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(slug)}; path=/; max-age=${60 * 60 * 24 * 30}`;
}

export function leeOrigenCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
