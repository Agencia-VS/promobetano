/**
 * Paleta de campaña para contextos que NO pueden leer CSS.
 *
 * El correo es el único caso: los clientes de correo no resuelven custom
 * properties, así que `var(--color-confianza)` llega literal y el fondo queda
 * transparente. Estos valores son los mismos de :root en app/globals.css y
 * tienen que moverse juntos.
 *
 * El brief prohíbe una paleta paralela para el correo (regla dura 14) porque
 * el repo anterior tenía tres naranjas distintos que el usuario veía en la
 * misma sesión: el de la web, el del correo y el de un botón. Acá hay UNA
 * constante, y todas las plantillas la usan.
 */
export const MARCA = {
  confianza: "#ff3900",
  bone: "#f9f1e9",
  ink: "#0a0605",
  rust: "#8a3c18",
  rustDeep: "#3c0000",
  white: "#ffffff",
} as const;
