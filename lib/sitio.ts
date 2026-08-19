/**
 * URL absoluta del sitio, para los enlaces e imágenes del correo.
 *
 * Un correo se abre fuera del sitio: una ruta como `/email/lockup-600.png` no
 * resuelve contra nada. Todo lo que salga por correo necesita el origen delante.
 */

/**
 * Devuelve el origen sin barra final, o `null` si no hay ninguno configurado.
 *
 * Se prefiere `VERCEL_PROJECT_PRODUCTION_URL` antes que `VERCEL_URL` porque la
 * segunda cambia en cada despliegue: un correo enviado hoy se abre dentro de
 * seis meses, y para entonces esa URL apunta a un despliegue que ya nadie mira.
 * La de producción es estable mientras el proyecto exista.
 */
export function baseAbsoluta(): string | null {
  const explicita = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicita) return explicita.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return null;
}

/**
 * URL absoluta de un recurso, o `null` si no se sabe cuál es el dominio.
 *
 * Devolver `null` en vez de una ruta relativa es deliberado: las plantillas
 * omiten la imagen entera cuando no hay dominio. Un correo sin logo se lee
 * perfectamente; uno con dos iconos de imagen rota parece que se envió por
 * error. Y así nada se bloquea mientras el dominio siga sin decidirse.
 */
export function urlAbsoluta(ruta: string): string | null {
  const base = baseAbsoluta();
  return base ? `${base}${ruta.startsWith("/") ? ruta : `/${ruta}`}` : null;
}
