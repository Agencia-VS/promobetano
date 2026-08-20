import { unstable_cache } from "next/cache";
import { supabasePublico } from "./supabase/publico.ts";
import {
  cierre,
  estadoEfectivo,
  inicio,
  type EstadoEfectivo,
} from "./concurso.ts";

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

/**
 * Lo vigente combina el calendario con dos cosas que solo sabe la base: el
 * interruptor manual y si hay un ensayo en curso.
 *
 * `pruebas` no se deduce del interruptor. Que las inscripciones estén abiertas
 * a mano puede ser una apertura de urgencia perfectamente real, y confundirla
 * con un ensayo pondría el aviso de «esto no participa» sobre inscripciones que
 * sí participan. Son dos hechos distintos y viajan como dos campos.
 *
 * Tampoco es el interruptor de ensayo a secas: la RPC comprueba que la jornada
 * activa sea efectivamente la de pruebas antes de encender el aviso público.
 */
export type EstadoVigente = EstadoEfectivo & {
  pruebas: boolean;
  ventanaDesde: Date | null;
  ventanaHasta: Date | null;
};

type Publico = {
  abiertas: boolean | null;
  pruebas: boolean;
  controlManual: boolean;
  ventanaDesde: string | null;
  ventanaHasta: string | null;
};

async function consultar(): Promise<Publico> {
  const supabase = supabasePublico();
  if (!supabase) {
    return {
      abiertas: null,
      pruebas: false,
      controlManual: false,
      ventanaDesde: null,
      ventanaHasta: null,
    };
  }

  const { data, error } = await supabase.rpc("estado_ruleta_publico");
  if (error) throw new Error(error.message);

  // La RPC devuelve una fila. PostgREST la entrega como array salvo que se
  // pida single, y pedirlo obligaría a tratar el 0-filas como error.
  const fila = (Array.isArray(data) ? data[0] : data) as
    | {
        inscripciones_abiertas: boolean;
        modo_pruebas: boolean;
        control_manual: boolean;
        ventana_desde: string | null;
        ventana_hasta: string | null;
      }
    | undefined;

  return {
    abiertas: fila?.inscripciones_abiertas ?? null,
    pruebas: fila?.modo_pruebas === true,
    controlManual: fila?.control_manual === true,
    ventanaDesde: fila?.ventana_desde ?? null,
    ventanaHasta: fila?.ventana_hasta ?? null,
  };
}

/**
 * La RPC medida cuesta entre 87 y 124 ms, y era prácticamente TODO el tiempo de
 * servidor de /i y de /inscripcion: el render en sí es despreciable. Ese retardo
 * se pagaba en cada apertura del modal, antes de pintar un solo pixel.
 *
 * Con unas tres vistas por persona y 500 altas diarias, evita alrededor de
 * 1.500 llamadas repetidas para leer datos que cambian pocas veces.
 *
 * Se cachea SOLO lo que dice la base. `estadoEfectivo` se aplica fuera porque
 * recibe un Date: dentro de la función cacheada ese argumento entraría en la
 * clave y la caché no acertaría nunca.
 */
const consultarCacheado = unstable_cache(consultar, ["estado-ruleta-publico-v1"], {
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
): Promise<EstadoVigente> {
  try {
    const {
      abiertas,
      pruebas,
      controlManual,
      ventanaDesde,
      ventanaHasta,
    } = await (opciones.fresco
      ? consultar()
      : consultarCacheado());
    const desde = fecha(ventanaDesde);
    const hasta = fecha(ventanaHasta);
    if (!controlManual && abiertas !== null) {
      return {
        estado: abiertas
          ? "abierto"
          : desde && ahora < desde
            ? "antes"
            : "cerrado",
        fuente: "calendario",
        pruebas,
        ventanaDesde: desde,
        ventanaHasta: hasta,
      };
    }
    return {
      ...estadoEfectivo(abiertas, ahora),
      pruebas,
      ventanaDesde: desde,
      ventanaHasta: hasta,
    };
  } catch (e) {
    console.error(
      "No se pudo leer el interruptor de inscripciones, se usa el calendario:",
      e instanceof Error ? e.message : e,
    );
    /*
     * `pruebas: false` en el camino de error, y no `true`. El aviso de ensayo
     * sobra cuando no hay ensayo, pero si apareciera por un fallo de red
     * durante la activación real le estaría diciendo a cada persona del mall
     * que su inscripción no vale.
     */
    return {
      ...estadoEfectivo(null, ahora),
      pruebas: false,
      ventanaDesde: inicio(),
      ventanaHasta: cierre(),
    };
  }
}

function fecha(valor: string | null): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}
