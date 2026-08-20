import { redirect } from "next/navigation";
import Link from "next/link";
import { usuarioAdmin } from "@/lib/supabase/servidor";
import { estadoVigente } from "@/lib/concurso-servidor";
import {
  cierre,
  fechaYHora,
  inicio,
  problemasCalendario,
} from "@/lib/concurso";
import { Barra } from "@/components/admin/Barra";
import { InterruptorConcurso } from "@/components/admin/InterruptorConcurso";
import type { Sorteo } from "@/components/admin/PanelSorteos";
import {
  ModoPruebas,
  type IdentidadPrueba,
} from "@/components/admin/ModoPruebas";
import { PruebaCorreo } from "@/components/admin/PruebaCorreo";
import { CORREO_DATOS_SIN_CONFIGURAR } from "@/lib/contacto";

export const dynamic = "force-dynamic";

type Resumen = {
  /** Inscripciones. Con tres jornadas, una persona puede tener hasta tres. */
  total: number;
  /**
   * Personas distintas por RUT. Es la cifra comparable con un sorteo único.
   *
   * Opcional porque la trajo la migración de jornadas: contra una base que aún
   * no la tiene, esta columna no viene. El tipo lo dice para que el compilador
   * obligue a tratarlo en vez de descubrirlo en producción.
   */
  personas?: number;
  elegibles: number;
  con_marketing: number;
  rebotes: number;
  quejas: number;
  /**
   * Inscripciones de ensayo. Ninguna de las cifras de arriba las cuenta, así
   * que esta es la única forma de saber que hay datos de prueba esperando a que
   * alguien los borre.
   */
  pruebas?: number;
};


type Jornada = {
  sorteo_id: number;
  clave: string;
  nombre: string;
  estado: string;
  ventana_desde: string;
  ventana_hasta: string;
  inscritos: number;
  pruebas: number;
  es_prueba: boolean;
  vigente: boolean;
};

const RELOJ = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  weekday: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function AdminPage() {
  /*
   * La sesión se verifica acá aunque proxy.ts ya la haya exigido. El matcher
   * del proxy es una lista que hay que acordarse de mantener; esta guardia vive
   * en el mismo archivo que los datos que protege (regla dura 1).
   */
  const { supabase, usuario } = await usuarioAdmin();
  if (!supabase || !usuario) redirect("/admin/login");

  const [
    estadoRes,
    resumenRes,
    sorteosRes,
    jornadasRes,
    identidadesRes,
    publicoRes,
  ] = await Promise.all([
    estadoVigente(),
    supabase.rpc("resumen_inscripciones"),
    supabase.rpc("listar_sorteos"),
    supabase.rpc("resumen_jornadas"),
    supabase.rpc("listar_identidades_prueba"),
    // El interruptor de ensayo CRUDO. `estadoRes.pruebas` es el derivado —«un
    // alta de ahora sería de ensayo»—, que es lo correcto para el sitio público
    // pero deja el botón de cerrar inhabilitado justo cuando hace falta: con el
    // modo encendido y una jornada real corriendo.
    supabase.rpc("estado_publico"),
  ]);

  const resumen = (
    Array.isArray(resumenRes.data) ? resumenRes.data[0] : resumenRes.data
  ) as Resumen | null;
  const sorteos = (sorteosRes.data ?? []) as Sorteo[];
  const jornadas = (jornadasRes.data ?? []) as Jornada[];
  const identidades = (identidadesRes.data ?? []) as IdentidadPrueba[];
  const publico = (
    Array.isArray(publicoRes.data) ? publicoRes.data[0] : publicoRes.data
  ) as { modo_pruebas?: boolean } | null;
  const modoPruebas = publico?.modo_pruebas === true;

  const desde = inicio();
  const hasta = cierre();

  /*
   * Dos desajustes distintos, y los dos dejan el formulario rechazando altas con
   * el QR pegado en el mall:
   *
   *   · el calendario del entorno no cuadra (CONCURSO_SORTEOS mal cargado, un
   *     cierre posterior al último sorteo);
   *   · el calendario está bien pero la BASE no tiene ninguna jornada que cubra
   *     este instante, porque nadie apretó «Sincronizar».
   *
   * El segundo es el que no se nota de ninguna otra forma: el alta responde 503 y
   * quien está en el mall ve «inscripciones en pausa» sin que nadie del equipo se
   * entere. Por eso se compara lo que dice el entorno con lo que hay en la base.
   */
  const problemas = problemasCalendario();

  /*
   * ¿Está aplicada la migración de jornadas?
   *
   * Este panel llama a las RPC por nombre y lee sus columnas sin tipos
   * generados, así que una base con una migración de menos no da un error de
   * compilación: da datos incompletos, y antes eso tumbaba la página con un
   * TypeError sobre una columna ausente. Se detecta explícitamente y se dice,
   * porque el resto de los avisos serían ruido —o directamente mentira— hasta
   * que la migración esté puesta.
   *
   * Dos señales, y basta una: `resumen_jornadas` no existe todavía, o
   * `resumen_inscripciones` respondió sin la columna `personas`. Se exige que
   * `resumen` no sea null para no confundir «falta la migración» con «la base no
   * respondió», que se arreglan de formas distintas.
   */
  const esquemaSinJornadas =
    Boolean(jornadasRes.error) ||
    (resumen !== null && resumen.personas === undefined);

  return (
    <>
      <Barra correo={usuario.email ?? ""} />

      <main className="adm__cuerpo">
        {CORREO_DATOS_SIN_CONFIGURAR && (
          <p className="aviso aviso--error">
            <strong>Bloqueante legal:</strong> el contacto de datos personales
            sigue siendo <code>datos@example.com</code>. La Ley 21.719 obliga a
            atender por esa vía las solicitudes de acceso y eliminación. Cárgalo
            en <code>NEXT_PUBLIC_CORREO_DATOS</code>.
          </p>
        )}

        {problemas.length > 0 && jornadas.length === 0 && (
          <div className="aviso aviso--error">
            <strong>Calendario de sorteos:</strong> revisa las variables
            <code> CONCURSO_SORTEOS</code>, <code>CONCURSO_INICIO</code> y{" "}
            <code>CONCURSO_CIERRE</code>.
            <ul>
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {esquemaSinJornadas && (
          <div className="aviso aviso--error">
            <strong>Falta aplicar la migración de jornadas en la base.</strong>{" "}
            El código ya espera los tres sorteos diarios, pero esta base todavía
            tiene el esquema anterior, así que el panel muestra datos incompletos
            y ejecutar un sorteo va a fallar.
            <br />
            <br />
            Aplica <code>
              supabase/migrations/20260819170000_jornadas.sql
            </code>{" "}
            —con <code>supabase db push</code> o pegándolo en el editor SQL— y
            recarga esta página. La migración crea las tres jornadas por su
            cuenta. Después configura las ventanas reales en la pestaña Ruleta.
            {jornadasRes.error ? (
              <>
                <br />
                <br />
                <span className="cifra__nombre">
                  La base respondió: {jornadasRes.error.message}
                </span>
              </>
            ) : null}
          </div>
        )}

        <div className="adm__rejilla">
          <InterruptorConcurso
            estado={estadoRes.estado}
            fuente={estadoRes.fuente}
            ventana={{
              inicio: desde ? fechaYHora(desde) : null,
              cierre: hasta ? fechaYHora(hasta) : null,
            }}
          />

          <ModoPruebas
            activo={modoPruebas}
            recibiendoAltas={estadoRes.pruebas}
            identidades={identidades}
            filasDePrueba={resumen?.pruebas ?? 0}
            /* Sale de `sorteos`, que ya está cargado: no hace falta una
               consulta más. Es lo que destraba el botón de limpieza cuando las
               inscripciones ya no están pero la jornada de ensayo sí. */
            sorteosDePrueba={sorteos.filter((s) => s.es_prueba).length}
          />

          <div className="tarjeta">
            <h2 className="tarjeta__titulo">Inscripciones</h2>
            {resumen ? (
              <div className="cifras">
                <Cifra valor={resumen.total} nombre="Total" />
                {/* Con una inscripción por jornada, `total` cuenta
                    inscripciones y no gente: sin esta cifra al lado, el número
                    grande se lee como personas y no lo es. */}
                <Cifra valor={resumen.personas} nombre="Personas" />
                <Cifra valor={resumen.elegibles} nombre="Elegibles" />
                <Cifra valor={resumen.con_marketing} nombre="Marketing" />
                <Cifra valor={resumen.rebotes} nombre="Rebotes" />
                <Cifra valor={resumen.quejas} nombre="Quejas" />
                {/* Se pinta solo cuando hay: en la activación real es siempre
                    cero y una cifra fija en cero es ruido. Cuando aparece, es
                    un recordatorio de que falta limpiar. */}
                {(resumen.pruebas ?? 0) > 0 && (
                  <Cifra valor={resumen.pruebas} nombre="Pruebas" />
                )}
              </div>
            ) : (
              <p className="vacio">Sin datos todavía.</p>
            )}
          </div>

          <div className="tarjeta">
            <h2 className="tarjeta__titulo">Por jornada</h2>
            {jornadas.length === 0 ? (
              <p className="vacio">
                Sin jornadas cargadas. Aplica las migraciones y configúralas en
                Ruleta: mientras no existan, el formulario no acepta inscripciones.
              </p>
            ) : (
              <div className="tabla-caja">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Jornada</th>
                      <th>Cierra</th>
                      <th>Inscritos</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jornadas.map((j) => (
                      <tr key={j.clave}>
                        <td>
                          {j.nombre}
                          {j.vigente ? (
                            <>
                              {" "}
                              <span className="pastilla">en curso</span>
                            </>
                          ) : null}
                          {j.es_prueba ? (
                            <>
                              {" "}
                              <span className="pastilla pastilla--declinado">
                                ensayo
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td className="tabla__tenue">
                          {RELOJ.format(new Date(j.ventana_hasta))}
                        </td>
                        <td>
                          {j.inscritos.toLocaleString("es-CL")}
                          {j.pruebas > 0 ? (
                            <span className="tabla__tenue">
                              {" "}
                              +{j.pruebas} de prueba
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className="pastilla">{j.estado}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/*
          No hay tarjeta «Por panel», y es a propósito. La atribución por ?p=
          existe para comparar ubicaciones, y esta activación se concentra en un
          solo punto: el QR está impreso contra la raíz del dominio, sin ?p=, así
          que la tabla mostraría una única fila «directo» con el total completo
          —un dato que ya está arriba— en la pantalla que el equipo mira durante
          el sorteo.

          La cañería sigue en pie (proxy.ts resuelve el origen, `inscripciones.
          origen` lo guarda y el listado lo filtra): si alguna vez hay más de un
          punto, esto vuelve a ser una tabla de tres líneas.
        */}

        <div className="tarjeta">
          <div className="tarjeta__cabecera">
            <div>
              <h2 className="tarjeta__titulo">Ruleta instantánea</h2>
              <p className="adm__bajada">
                N manual/automático, stock diario, horarios y lista imprimible
                de ganadores están separados del sorteo diferido anterior.
              </p>
            </div>
            <Link href="/admin/ruleta" className="btn btn--primario">
              Abrir ruleta
            </Link>
          </div>
        </div>

        <PruebaCorreo />
      </main>
    </>
  );
}

/**
 * Una cifra del resumen.
 *
 * `valor` admite null y undefined a propósito. Este panel lee RPC por nombre de
 * columna, sin tipos generados, así que una base con una migración de menos
 * devuelve una columna menos y llega `undefined`. Antes eso tumbaba la página
 * entera con un TypeError —y justo cuando el panel es la herramienta que hace
 * falta para arreglarlo—; ahora se pinta un guion y el aviso de arriba explica
 * la causa.
 */
function Cifra({
  valor,
  nombre,
}: {
  valor: number | null | undefined;
  nombre: string;
}) {
  return (
    <div>
      <div className="cifra__valor">
        {typeof valor === "number" ? valor.toLocaleString("es-CL") : "—"}
      </div>
      <div className="cifra__nombre">{nombre}</div>
    </div>
  );
}
