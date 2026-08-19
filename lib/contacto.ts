/**
 * Contacto para derechos del titular (Ley 21.719, derechos ARCO+).
 *
 * Sale de una variable de entorno porque la casilla la define el responsable
 * del tratamiento y no el repositorio, y porque cambiarla no debería costar un
 * despliegue: es la dirección por la que la ley obliga a atender solicitudes
 * de acceso, rectificación y eliminación.
 *
 * Lleva prefijo NEXT_PUBLIC_ a propósito: se muestra en el formulario, en
 * /listo y en las bases, que son componentes de cliente. No es un secreto —es
 * una dirección publicada— así que viajar en el bundle es correcto.
 *
 * El respaldo es un dominio reservado por la RFC 2606, no uno registrable. La
 * versión anterior usaba datos@dominio.cl, y dominio.cl es un dominio REAL:
 * cada usuario que escribía con su nombre, RUT y teléfono se los mandaba a un
 * tercero desconocido. Si ves esta dirección en producción, la variable no
 * está cargada.
 */
export const CORREO_DATOS =
  process.env.NEXT_PUBLIC_CORREO_DATOS || "datos@example.com";

/** true cuando la casilla real todavía no se configuró. Lo usa el panel y las
    verificaciones previas al lanzamiento para no publicar con el marcador. */
export const CORREO_DATOS_SIN_CONFIGURAR = CORREO_DATOS.endsWith("@example.com");
