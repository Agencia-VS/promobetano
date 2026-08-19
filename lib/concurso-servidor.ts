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
export async function estadoVigente(
  ahora: Date = new Date(),
): Promise<EstadoEfectivo> {
  const supabase = supabasePublico();
  if (!supabase) return estadoEfectivo(null, ahora);

  try {
    const { data, error } = await supabase.rpc("estado_inscripciones");
    if (error) throw new Error(error.message);
    return estadoEfectivo(data as boolean | null, ahora);
  } catch (e) {
    console.error(
      "No se pudo leer el interruptor de inscripciones, se usa el calendario:",
      e instanceof Error ? e.message : e,
    );
    return estadoEfectivo(null, ahora);
  }
}
