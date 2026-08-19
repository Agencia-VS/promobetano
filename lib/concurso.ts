/**
 * Fuente única de las reglas de negocio del concurso.
 *
 * Las fechas viven en variables de entorno y no en constantes del código
 * porque en una activación la ventana se mueve —se atrasa la instalación de un
 * panel, el cliente pide un día más— y cada cambio no debería costar un
 * commit, una compilación y un despliegue. Cambiar `CONCURSO_CIERRE` en Vercel
 * y redesplegar es una operación de treinta segundos que puede hacer alguien
 * que no toca el repo.
 *
 * Ojo con el huso: Chile cambia de horario en septiembre, así que un cierre
 * escrito como "23 de agosto a las 23:00" sin offset se corre una hora solo en
 * cuanto pasa el cambio. Por eso el formato exigido es ISO 8601 CON offset
 * explícito (`2026-08-23T23:00:00-04:00`) y no una fecha local ambigua.
 *
 * Se leen con funciones y no con constantes de módulo para que el valor no
 * quede congelado en el primer import: así las pruebas pueden mover la ventana
 * y el servidor recoge un cambio de variable sin reiniciar el proceso.
 */

export type EstadoConcurso = "sin_configurar" | "antes" | "abierto" | "cerrado";

/** Zona para MOSTRAR fechas. No participa en las comparaciones: esas se hacen
    entre instantes absolutos, donde el huso ya lo resolvió el offset. */
export function zona(): string {
  return process.env.CONCURSO_TZ || "America/Santiago";
}

/**
 * Una fecha inválida se trata como ausente, no como el epoch. `new Date("lo
 * que sea")` devuelve Invalid Date en vez de lanzar, y toda comparación contra
 * él da false: sin este guard, un typo en Vercel dejaría el concurso
 * permanentemente "antes de empezar" sin ningún error visible.
 */
function leeFecha(valor: string | undefined): Date | null {
  if (!valor || valor.trim() === "") return null;
  const d = new Date(valor.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function inicio(): Date | null {
  return leeFecha(process.env.CONCURSO_INICIO);
}

export function cierre(): Date | null {
  return leeFecha(process.env.CONCURSO_CIERRE);
}

/**
 * Estado del concurso en un instante dado.
 *
 * `sin_configurar` es un estado explícito y no un alias de "abierto": si
 * faltan las fechas, lo correcto es que quien administre lo note, no que el
 * formulario acepte inscripciones indefinidamente porque nadie cargó la
 * variable. Una ventana invertida —cierre antes que inicio— también cae acá:
 * es un error de carga, no un concurso que ya terminó.
 */
export function estadoConcurso(ahora: Date = new Date()): EstadoConcurso {
  const desde = inicio();
  const hasta = cierre();
  if (!desde || !hasta || desde >= hasta) return "sin_configurar";
  if (ahora < desde) return "antes";
  if (ahora > hasta) return "cerrado";
  return "abierto";
}

/** Única función que decide si se acepta una inscripción. La llaman el
    formulario (para pintar el estado) y la ruta de API (para exigirlo). */
export function inscripcionesAbiertas(ahora: Date = new Date()): boolean {
  return estadoConcurso(ahora) === "abierto";
}

function formato(opciones: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("es-CL", { timeZone: zona(), ...opciones });
}

/** "viernes, 21 de agosto de 2026" */
export function fechaLarga(d: Date): string {
  return formato({
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "23 de agosto" — para las placas de la portada, donde el espacio manda. */
export function fechaCorta(d: Date): string {
  return formato({ day: "numeric", month: "long" }).format(d);
}

/** "23:00" */
export function hora(d: Date): string {
  return formato({ hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** "domingo, 23 de agosto de 2026 a las 23:00" */
export function fechaYHora(d: Date): string {
  return `${fechaLarga(d)} a las ${hora(d)}`;
}

/**
 * Texto de la placa de la portada. Devuelve null cuando no hay nada
 * verificable que decir, para que la vista muestre su marca de "dato
 * pendiente" en vez de inventar una fecha.
 */
export function etiquetaVentana(ahora: Date = new Date()): string | null {
  const estado = estadoConcurso(ahora);
  if (estado === "sin_configurar") return null;
  if (estado === "cerrado") return "Cerradas";
  if (estado === "antes") {
    const desde = inicio();
    return desde ? `Abren el ${fechaCorta(desde)}` : null;
  }
  const hasta = cierre();
  return hasta ? `Hasta el ${fechaCorta(hasta)}` : null;
}
