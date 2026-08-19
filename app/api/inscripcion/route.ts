import { NextResponse, type NextRequest } from "next/server";
import { supabasePublico } from "@/lib/supabase/publico";
import { estadoVigente } from "@/lib/concurso-servidor";
import { normalizaTelefono, valida } from "@/lib/inscripcion";
import { HEADER_ORIGEN, ORIGEN_DIRECTO, slugValido } from "@/lib/origen";

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
 * No envía correo. Encolar es responsabilidad de la RPC, y el envío lo hace el
 * cron: si Resend tarda 800 ms, la persona en el mall espera 800 ms de más, y
 * si Resend falla se perdería la inscripción entera por un correo que se podía
 * reintentar (regla dura 8).
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
    mkt: datos.mkt === true,
  };

  const errores = valida(valores);
  if (Object.keys(errores).length > 0) {
    return NextResponse.json(
      { error: "datos_invalidos", campos: errores },
      { status: 400 },
    );
  }

  /*
   * El origen sale del header que pone proxy.ts, no del cuerpo. Si viniera del
   * cliente, cualquiera podría acreditarle sus inscripciones al panel que
   * quisiera y el reporte por ubicación dejaría de significar nada.
   */
  const cabecera = request.headers.get(HEADER_ORIGEN);
  const origen =
    cabecera && slugValido(cabecera) ? cabecera : ORIGEN_DIRECTO;

  const { data, error } = await supabase.rpc("crear_inscripcion", {
    p_nombre: valores.nombre,
    p_email: valores.email,
    p_telefono: normalizaTelefono(valores.tel),
    p_documento: valores.rut,
    p_declara_edad: valores.edad,
    p_acepta_bases: valores.bases,
    p_acepta_marketing: valores.mkt,
    p_origen: origen,
  });

  if (error) {
    console.error("crear_inscripcion falló:", error.message);
    return NextResponse.json({ error: "servidor" }, { status: 502 });
  }

  // La RPC devuelve una fila: { resultado, inscripcion_id }.
  const fila = Array.isArray(data) ? data[0] : data;
  const resultado = fila?.resultado as string | undefined;

  switch (resultado) {
    case "creada":
      return NextResponse.json({ ok: true }, { status: 201 });
    case "duplicado_rut":
    case "duplicado_email":
      // 409 y no 400: los datos son válidos, lo que pasa es que esa persona ya
      // está inscrita. El formulario lo dice con su propio mensaje.
      return NextResponse.json({ error: resultado }, { status: 409 });
    case "rut_invalido":
    case "falta_consentimiento":
    case "datos_invalidos":
      return NextResponse.json({ error: resultado }, { status: 400 });
    default:
      console.error("crear_inscripcion devolvió algo inesperado:", resultado);
      return NextResponse.json({ error: "servidor" }, { status: 502 });
  }
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}
