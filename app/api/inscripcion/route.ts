import { NextResponse, type NextRequest } from "next/server";
import { supabasePublico } from "@/lib/supabase/publico";
import { diaSorteo } from "@/lib/concurso";
import { estadoVigente } from "@/lib/concurso-servidor";
import { normalizaTelefono, valida } from "@/lib/inscripcion";
import {
  COOKIE_ORIGEN,
  HEADER_ORIGEN,
  ORIGEN_DIRECTO,
  slugValido,
} from "@/lib/origen";

export const runtime = "nodejs";
// La ventana del concurso se evalúa contra el reloj de cada petición: esta
// ruta no puede cachearse ni prerenderizarse.
export const dynamic = "force-dynamic";

/**
 * Alta de inscripción.
 *
 * Toda validación del cliente se repite acá (regla dura 3): el formulario es
 * evadible con una consola abierta, y esta ruta es la única frontera real.
 *
 * No envía correo. La RPC solo encola el respaldo si el resultado es ganador,
 * y el cron lo manda después. Inscripción, bloque, stock, folio y outbox quedan
 * en una única transacción de PostgreSQL.
 */
export async function POST(request: NextRequest) {
  // Se comprueba acá y no solo en la página: quien tenga el formulario abierto
  // desde antes del cierre —o desde antes de que alguien lo cierre a mano—
  // puede enviarlo igual.
  const { estado } = await estadoVigente(new Date(), { fresco: true });
  if (estado !== "abierto") {
    return NextResponse.json({ error: "cerrado" }, { status: 409 });
  }

  const supabase = supabasePublico();
  if (!supabase) {
    // Explícito y distinguible de un fallo de red, para que el formulario
    // pueda ofrecer reintento sin mentir sobre la causa.
    return NextResponse.json({ error: "sin_configurar" }, { status: 503 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400 });
  }

  const datos = cuerpo as Record<string, unknown>;
  const valores = {
    nombre: texto(datos.nombre),
    email: texto(datos.email),
    tel: texto(datos.tel),
    rut: texto(datos.rut),
    edad: datos.edad === true,
    bases: datos.bases === true,
  };

  const errores = valida(valores);
  if (Object.keys(errores).length > 0) {
    return NextResponse.json(
      { error: "datos_invalidos", campos: errores },
      { status: 400 },
    );
  }

  /*
   * El origen sale del header que pone proxy.ts o de la cookie que ese mismo
   * proxy escribió, NUNCA del cuerpo. Si viniera del cliente, cualquiera podría
   * acreditarle sus inscripciones al panel que quisiera y el reporte por
   * ubicación dejaría de significar nada.
   *
   * Las dos fuentes y no solo el header: el header vale mientras esta ruta esté
   * en el matcher de proxy.ts, y esa lista hay que acordarse de mantenerla.
   * Estar fuera de ella es exactamente el defecto que tuvo esta ruta —toda
   * inscripción quedaba en "directo" aunque se llegara por /i?p=…— y la cookie,
   * que es httpOnly y viaja igual en el POST, lo hace irrelevante.
   */
  const origen = origenDe(request);

  const requestId = uuid(datos.request_id) ?? crypto.randomUUID();

  const { data, error } = await supabase.rpc("crear_inscripcion_ruleta", {
    p_nombre: valores.nombre,
    p_email: valores.email,
    p_telefono: normalizaTelefono(valores.tel),
    p_documento: valores.rut,
    p_declara_edad: valores.edad,
    p_acepta_bases: valores.bases,
    // El formulario ya no solicita autorizaciones promocionales. La columna
    // histórica se conserva en la base, pero toda alta nueva queda en false.
    p_acepta_marketing: false,
    p_origen: origen,
    p_request_id: requestId,
  });

  if (error) {
    console.error("crear_inscripcion_ruleta falló:", error.message);
    return NextResponse.json({ error: "servidor" }, { status: 502 });
  }

  // La RPC devuelve la decisión persistida. Si el navegador reintenta el mismo
  // request_id por un timeout, recibe exactamente este resultado otra vez.
  const fila = Array.isArray(data) ? data[0] : data;
  const resultado = fila?.resultado as string | undefined;

  switch (resultado) {
    case "creada": {
      const sorteoAt = fecha(fila?.sorteo_at);
      const ganador = fila?.ganador === true;
      const pruebas = fila?.es_prueba === true;
      const numeroGanador =
        typeof fila?.numero_ganador === "number" &&
        Number.isInteger(fila.numero_ganador) &&
        fila.numero_ganador >= 1 &&
        (pruebas || fila.numero_ganador <= 90)
          ? fila.numero_ganador
          : null;
      if (ganador && numeroGanador === null) {
        console.error(
          "crear_inscripcion_ruleta devolvió ganador sin correlativo:",
          fila?.inscripcion_id,
        );
        return NextResponse.json({ error: "servidor" }, { status: 502 });
      }
      return NextResponse.json(
        {
          ok: true,
          ganador,
          numero_ganador: numeroGanador,
          sorteo: sorteoAt ? diaSorteo(sorteoAt) : null,
          pruebas,
        },
        { status: 201 },
      );
    }
    case "duplicado_rut":
    case "duplicado_email":
      // 409 y no 400: los datos son válidos, lo que pasa es que esa persona ya
      // está inscrita EN EL SORTEO DE HOY. El formulario lo dice con su propio
      // mensaje, que incluye que mañana se puede volver a participar.
      return NextResponse.json({ error: resultado }, { status: 409 });
    case "rut_invalido":
    case "falta_consentimiento":
    case "datos_invalidos":
      return NextResponse.json({ error: resultado }, { status: 400 });
    case "sin_jornada":
      /*
       * No hay ninguna jornada cargada que cubra este instante. NO es culpa de
       * quien se inscribe y tampoco es "cerrado": es configuración incompleta
       * —las ventanas de la base no llegan hasta acá— y quien tiene que
       * enterarse es el equipo. 503 y no 4xx porque el reintento más tarde puede
       * funcionar, y el detalle accionable va al log del servidor.
       */
      console.error(
        "crear_inscripcion_ruleta devolvió sin_jornada: ninguna ventana instantánea de `sorteos` cubre este instante. Revisa /admin/ruleta.",
      );
      return NextResponse.json({ error: "sin_jornada" }, { status: 503 });
    case "vetado":
      // Baja lógica por incumplimiento. 403 y un mensaje neutro: el motivo no se
      // le explica a quien lo intenta, pero se le da una vía para reclamar.
      return NextResponse.json({ error: "vetado" }, { status: 403 });
    default:
      console.error(
        "crear_inscripcion_ruleta devolvió algo inesperado:",
        resultado,
      );
      return NextResponse.json({ error: "servidor" }, { status: 502 });
  }
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function uuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  )
    ? v
    : null;
}

function fecha(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Header primero, cookie después: el header lleva el ?p= de la petición que
    trajo a la persona, y la cookie lo que se resolvió en una visita anterior. */
function origenDe(request: NextRequest): string {
  const cabecera = request.headers.get(HEADER_ORIGEN);
  if (cabecera && slugValido(cabecera) && cabecera !== ORIGEN_DIRECTO) {
    return cabecera;
  }
  const galleta = request.cookies.get(COOKIE_ORIGEN)?.value;
  return galleta && slugValido(galleta) ? galleta : ORIGEN_DIRECTO;
}
