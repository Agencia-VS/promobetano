import type { Confirmado } from "./confirmado.ts";

/**
 * Convierte la respuesta exitosa del alta en la decisión que verá la persona.
 *
 * Un HTTP 2xx no alcanza: si un proxy corta el JSON o una versión incompatible
 * omite `ganador`, asumir `false` puede esconder un premio que PostgreSQL ya
 * asignó. Ante cualquier incoherencia se devuelve null para que el formulario
 * conserve el request_id y recupere la misma decisión al reintentar.
 */
export function confirmaResultado(
  cuerpo: unknown,
  contexto: { email: string; origen: string },
): Confirmado | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const datos = cuerpo as Record<string, unknown>;
  if (
    datos.ok !== true ||
    typeof datos.ganador !== "boolean" ||
    (datos.pruebas !== undefined && typeof datos.pruebas !== "boolean")
  ) {
    return null;
  }

  const pruebas = datos.pruebas === true;
  const numero = datos.numero_ganador;
  const numeroGanador =
    typeof numero === "number" &&
    Number.isInteger(numero) &&
    numero >= 1 &&
    (pruebas || numero <= 90)
      ? numero
      : undefined;

  // Un ganador sin folio no tiene una prueba válida para retirar el premio.
  // Un perdedor con folio también es una respuesta incoherente y no se adivina.
  if (datos.ganador && numeroGanador === undefined) return null;
  if (!datos.ganador && numero !== null && numero !== undefined) return null;

  if (
    datos.sorteo !== undefined &&
    datos.sorteo !== null &&
    typeof datos.sorteo !== "string"
  ) {
    return null;
  }

  return {
    email: contexto.email.trim(),
    origen: contexto.origen,
    ganador: datos.ganador,
    numeroGanador,
    sorteo: typeof datos.sorteo === "string" ? datos.sorteo : undefined,
    pruebas,
  };
}
