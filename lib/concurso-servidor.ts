import { unstable_cache } from "next/cache";
import { supabasePublico } from "./supabase/publico.ts";
import { estadoEfectivo, type EstadoEfectivo } from "./concurso.ts";

/**
 * Estado vigente del concurso, leyendo el interruptor manual de la base.
 *
 * Vive aparte de lib/concurso.ts para que ese módulo siga siendo puro: lo
 * importan las pruebas unitarias, y no tienen por qué arrastrar el cliente de
 * Supabase para comprobar una comparación de fechas.
 *
 * Si la base no responde se cae al calendario en vez de fallar. Un problema de
 * red no debería dejar la portada sin poder decir si el concurso está abierto,
 * y el calendario es una respuesta correcta el 99% del tiempo.
 */

/** Etiqueta de caché. El panel la invalida al mover el interruptor. */
export const TAG_INTERRUPTOR = "interruptor-inscripciones";

async function consultar(): Promise<boolean | null> {
  const supabase = supabasePublico();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("estado_inscripciones");
  if (error) throw new Error(error.message);
  return data as boolean | null;
}

/**
 * La RPC medida cuesta entre 87 y 124 ms, y era prácticamente TODO el tiempo de
 * servidor de /i y de /inscripcion: el render en sí es despreciable. Ese retardo
 * se pagaba en cada apertura del modal, antes de pintar un solo pixel.
 *
 * También es una cifra de escala: dimensionados para 10.000 inscripciones al día
 * y con unas tres vistas por persona, son ~30.000 llamadas diarias para leer un
 * booleano que cambia dos veces en toda la campaña.
 *
 * Se cachea SOLO el booleano de la base. `estadoEfectivo` se aplica fuera porque
 * recibe un Date: dentro de la función cacheada ese argumento entraría en la
 * clave y la caché no acertaría nunca.
 */
const consultarCacheado = unstable_cache(consultar, ["estado-inscripciones"], {
  // Techo del desfase si la invalidación por etiqueta fallara. En condiciones
  // normales no se llega: el panel invalida al mover el interruptor.
  revalidate: 30,
  tags: [TAG_INTERRUPTOR],
});

export async function estadoVigente(
  ahora: Date = new Date(),
  opciones: {
    /**
     * Salta la caché. Lo usa /api/inscripcion, que es donde el cierre se
     * *aplica* y no solo se *muestra*: aceptar altas durante medio minuto
     * después de cerrar a mano es un problema legal, no de rendimiento. Pintar
     * la portada con el estado de hace veinte segundos no lo es.
     */
    fresco?: boolean;
  } = {},
): Promise<EstadoEfectivo> {
  try {
    const manual = await (opciones.fresco ? consultar() : consultarCacheado());
    return estadoEfectivo(manual, ahora);
  } catch (e) {
    console.error(
      "No se pudo leer el interruptor de inscripciones, se usa el calendario:",
      e instanceof Error ? e.message : e,
    );
    return estadoEfectivo(null, ahora);
  }
}
