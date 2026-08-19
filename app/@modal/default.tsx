/**
 * Ranura vacía.
 *
 * Sin este archivo, una recarga o una visita directa a cualquier ruta que no
 * sea /inscripcion falla: Next no puede recuperar el estado activo de una
 * ranura con nombre tras una navegación dura y exige un default.
 */
export default function SinModal() {
  return null;
}
