import Link from "next/link";
import type { Metadata } from "next";
import { Badge18 } from "@/components/Badge18";
import { CORREO_DATOS } from "@/lib/contacto";
import { fechaYHora, jornadas } from "@/lib/concurso";
import { supabasePublico } from "@/lib/supabase/publico";

export const metadata: Metadata = {
  title: "Bases y condiciones — Eau de Confianza",
  robots: { index: false },
};

/*
 * Esta ruta existe porque la casilla de consentimiento del formulario es
 * OBLIGATORIA y enlazaba a /bases, que daba 404: se pedía aceptar términos que
 * el usuario no podía leer, lo que hace inexigible el consentimiento.
 *
 * El documento se adaptó desde las bases del concurso anterior ("Final
 * Experience Betano"), conservando su estructura y los datos del responsable.
 * DOS CAMBIOS DE FONDO respecto de aquel texto, que no son de redacción:
 *
 * 1. Aquel decía "no se usarán para marketing, publicidad ni perfilamiento".
 *    Acá NO puede decir eso: el formulario tiene una casilla separada y
 *    opcional de comunicaciones comerciales. Copiar la cláusula anterior
 *    contradiría lo que la persona acaba de marcar en pantalla, y un
 *    consentimiento que contradice las bases es un consentimiento inválido.
 *
 * 2. Aquel concurso no era de una marca de apuestas dirigiéndose al público
 *    con un producto de consumo. Acá la mayoría de edad no es solo un
 *    requisito de participación: es una condición de la comunicación misma,
 *    y por eso tiene su propia sección.
 *
 * ── Criterios actualizados el 20 ago 2026 ───────────────────────────────────
 *
 * El cliente reemplazó el sorteo diferido por una ruleta instantánea con hasta
 * 30 premios diarios, 90 globales y un premio por persona. Se mantienen acá las
 * decisiones que afectan la redacción legal:
 *
 *   · Betano es la MARCA de la campaña, no un destinatario de los datos. El
 *     Organizador es el único responsable, también para las comunicaciones
 *     comerciales. Es lo que hace el código: no hay integración con ningún CRM.
 *     Si algún día se agrega, hace falta consentimiento nuevo y esta §1 cambia.
 *   · Exclusiones: trabajadores del Organizador, de Betano y de las agencias, más
 *     cónyuge/conviviente y parientes hasta segundo grado. Es el estándar.
 *   · Premio: un frasco del perfume de la campaña por ganador. NO se declara un
 *     valor en pesos: no es exigible y un número inventado sí lo sería en contra.
 *   · Entrega: inmediata en la mesa, mostrando una pantalla con folio correlativo.
 *     El correo de ganador es solo un respaldo.
 *   · Conservación: 12 meses para el sorteo, 24 para marketing. Plazos relativos y
 *     no fechas fijas, para que no queden desfasados si la activación se mueve.
 *   · Respuesta a solicitudes ARCO+: 30 días corridos.
 *   · Juego responsable: se remite a un profesional de salud SIN dar un teléfono.
 *     Publicar un número equivocado en una cláusula legal es peor que no darlo; si
 *     el cliente entrega el canal oficial, va acá.
 *
 * El único dato que sigue viniendo del entorno es el contacto de datos
 * personales (NEXT_PUBLIC_CORREO_DATOS): mientras apunte a un dominio de la
 * RFC 2606 no hay a quién escribirle para ejercer los derechos de la §12.
 */

// Las fechas salen primero de la configuración administrable de la base. Las
// variables de entorno son solo el respaldo durante un despliegue incompleto.
export const dynamic = "force-dynamic";

/**
 * "a, b y c". Se repite la hora en cada fecha en vez de decirla una sola vez al
 * final: si algún día un sorteo se corre a otra hora, la frase resumida pasaría a
 * ser falsa sin que nadie la vuelva a leer.
 */
function enumera(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

function fecha(valor: string | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function BasesPage() {
  const supabase = supabasePublico();
  const { data } = supabase
    ? await supabase.rpc("listar_jornadas_ruleta_publico")
    : { data: null };
  const configuradas = (data ?? []) as Array<{
    nombre: string;
    ventana_desde: string;
    ventana_hasta: string;
    limite_diario: number;
  }>;
  const respaldo = jornadas().map((j) => ({
    nombre: j.nombre,
    ventana_desde: j.desde.toISOString(),
    ventana_hasta: j.sorteoAt.toISOString(),
    limite_diario: 30,
  }));
  const sorteos = configuradas.length > 0 ? configuradas : respaldo;
  const desde = fecha(sorteos[0]?.ventana_desde);
  const hasta = fecha(sorteos.at(-1)?.ventana_hasta);

  return (
    <main
      style={{
        maxWidth: "68ch",
        margin: "0 auto",
        padding:
          "48px max(22px, env(safe-area-inset-left)) calc(64px + env(safe-area-inset-bottom)) max(22px, env(safe-area-inset-right))",
        fontSize: 15.5,
        lineHeight: 1.7,
        color: "var(--color-bone)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-title)",
          fontSize: 11,
          letterSpacing: ".3em",
          textTransform: "uppercase",
          color: "var(--color-confianza)",
        }}
      >
        Eau de Confianza · Betano × Cristián Riquelme
      </p>
      <h1
        style={{
          margin: "10px 0 32px",
          fontFamily: "var(--font-title)",
          fontWeight: 800,
          fontSize: 30,
          lineHeight: 1.1,
          letterSpacing: ".04em",
          textTransform: "uppercase",
        }}
      >
        Bases legales y política de tratamiento de datos
      </h1>

      <Seccion titulo="1. Responsable del tratamiento">
        Para la activación «Eau de Confianza» (en adelante, la «Activación»), el
        responsable del tratamiento de los datos personales, conforme a la Ley
        N° 19.628 modificada por la Ley N° 21.719 sobre Protección de Datos
        Personales, es <strong>AGENCIA VS SPA</strong>, RUT{" "}
        <strong>77.043.073-9</strong>, con domicilio en{" "}
        <strong>Diagonal Oriente 1850, Providencia</strong> (en adelante, el
        «Organizador»).
        <br />
        <br />
        El desarrollo y la operación técnica de la plataforma de inscripción
        están a cargo de <strong>Antonio Capra Barbera</strong>, RUT{" "}
        <strong>18.467.272-3</strong>, quien actúa como{" "}
        <strong>encargado del tratamiento</strong> por cuenta del Organizador,
        sujeto a un acuerdo de tratamiento de datos.
        <br />
        <br />
        <strong>Betano</strong> es la marca de la campaña a la que pertenece la
        Activación. Los datos de los participantes <strong>no se ceden</strong> a
        Betano ni a ningún otro tercero en calidad de responsable: el Organizador
        es el único responsable del tratamiento, tanto para administrar el sorteo
        (sección 8) como para las comunicaciones comerciales que el participante
        haya autorizado por separado (sección 9). Si en el futuro el Organizador
        quisiera comunicar estos datos a un tercero como responsable, ello
        requeriría un consentimiento nuevo, específico y separado, solicitado al
        titular antes de la comunicación.
      </Seccion>

      <Seccion titulo="2. En qué consiste la Activación">
        La Activación se difunde mediante códigos QR ubicados en paneles
        publicitarios. Al escanearlo, la persona accede a un formulario de
        inscripción. Al completarlo, una ruleta muestra inmediatamente si la
        persona ganó el premio descrito en la sección 6. La participación es
        gratuita y no requiere compra ni contratación de ningún producto ni
        servicio.
      </Seccion>

      <Seccion titulo="3. Quién puede participar">
        Personas naturales <strong>mayores de 18 años</strong>, residentes en
        Chile, con cédula de identidad chilena vigente, que completen el
        formulario con datos veraces y acepten estas bases. La declaración de
        mayoría de edad es obligatoria y se realiza mediante una casilla
        específica antes de inscribirse.
        <br />
        <br />
        Quedan excluidos los trabajadores del Organizador y de sus empresas
        relacionadas, el encargado del tratamiento, los trabajadores de Betano y
        los de las agencias y proveedores que hayan participado en la producción o
        la operación de la Activación. La exclusión se extiende al cónyuge o
        conviviente civil y a los parientes por consanguinidad o afinidad hasta el
        segundo grado inclusive de las personas excluidas.
        <br />
        <br />
        Pueden participar residentes de cualquier región del país. Cualquier
        gasto de traslado u otro asociado a recibir el premio es de cargo
        exclusivo del ganador, salvo que estas bases digan expresamente lo
        contrario en la sección 6.
      </Seccion>

      <Seccion titulo="4. Vigencia">
        El período de inscripción se extiende{" "}
        {desde && hasta ? (
          <>
            desde el <strong>{fechaYHora(desde)}</strong> hasta el{" "}
            <strong>{fechaYHora(hasta)}</strong>
          </>
        ) : (
          <>durante las fechas informadas en los canales de la Activación</>
        )}
        , en horario de Chile continental. Las inscripciones recibidas fuera de
        ese período no participan.
        <br />
        <br />
        Cada persona puede inscribirse{" "}
        <strong>una sola vez por cada jornada diaria</strong>, y por lo tanto hasta{" "}
        {sorteos.length || 3} veces durante todo el período. La unicidad se
        determina, dentro de cada jornada, por RUT y por correo electrónico en su
        forma normalizada, de modo que las variantes de escritura del mismo dato
        —puntos, guiones, ceros a la izquierda, mayúsculas— se reconocen como una
        única inscripción. Las inscripciones duplicadas o con datos falsos se
        descartan.
        <br />
        <br />
        Sin perjuicio de lo anterior, cada persona puede resultar{" "}
        <strong>ganadora una sola vez</strong> durante todo el período: quien ya
        tenga un premio asignado queda excluido de asignaciones posteriores,
        aunque se haya inscrito nuevamente.
      </Seccion>

      <Seccion titulo="5. Ruleta instantánea y asignación de ganadores">
        Cada inscripción válida recibe un resultado inmediato. Las
        participaciones de cada jornada se agrupan en bloques de tamaño{" "}
        <strong>N</strong>, y el sistema elige aleatoriamente una posición
        ganadora dentro de cada bloque. El valor N puede ajustarse según el ritmo
        observado para procurar distribuir los premios durante el horario de la
        jornada. Una vez abierto un bloque, su tamaño y su posición ganadora no
        cambian; cualquier ajuste se aplica al bloque siguiente.
        <br />
        <br />
        {sorteos.length > 0 ? (
          <>
            Las jornadas operan{" "}
            <strong>
              {enumera(
                sorteos.map((j) => {
                  const apertura = fecha(j.ventana_desde);
                  const cierre = fecha(j.ventana_hasta);
                  return apertura && cierre
                    ? "desde el " +
                        fechaYHora(apertura) +
                        " hasta el " +
                        fechaYHora(cierre)
                    : j.nombre;
                }),
              )}
            </strong>
            . En cada jornada se asignan como máximo{" "}
            <strong>{sorteos[0]?.limite_diario ?? 30} premios</strong>.
          </>
        ) : (
          <>
            Las jornadas funcionan en las fechas y horas informadas en los
            canales de la Activación, con un máximo de{" "}
            <strong>30 premios por jornada</strong>.
          </>
        )}
        <br />
        <br />
        El máximo de la Activación es de <strong>90 premios</strong>. Si una
        jornada termina sin asignar sus 30 premios, el saldo no se traslada a
        otra jornada y el total final puede ser inferior a 90. Quedan fuera de
        la asignación las inscripciones dadas de baja por incumplimiento de estas
        bases y quienes ya hayan ganado durante la Activación.
      </Seccion>

      <Seccion titulo="6. Premio">
        El premio consiste en{" "}
        <strong>
          un frasco del perfume «Eau de Confianza» por cada ganador
        </strong>
        , en la presentación de la campaña. El premio es personal e
        intransferible, no es canjeable por dinero ni por otro premio, y no puede
        fraccionarse. El Organizador entrega un solo premio por persona, conforme
        a la sección 4.
        <br />
        <br />
        La entrega se realiza en la mesa de premiación de la Activación. La
        persona ganadora debe acercarse y mostrar la pantalla de éxito con su{" "}
        <strong>número de ganador único</strong>. El personal registra la entrega
        marcando ese número en la lista impresa de control.
        <br />
        <br />
        Si por causas ajenas al Organizador el premio dejara de estar disponible,
        podrá reemplazarse por otro de características y valor equivalentes,
        informando al ganador antes de la entrega.
      </Seccion>

      <Seccion titulo="7. Notificación a los ganadores">
        La pantalla mostrada al terminar la ruleta es la notificación principal.
        Solo a quienes resulten ganadores se les envía además un correo simple de
        respaldo al correo registrado, indicando que deben acercarse a la mesa de
        premiación y mostrando el mismo número de ganador.
        <br />
        <br />
        El número es correlativo entre 1 y 90 durante toda la Activación y queda
        vinculado a la inscripción para mantener la trazabilidad del resultado.
      </Seccion>

      <Seccion titulo="8. Datos que tratamos y con qué finalidad">
        Al inscribirse, el participante otorga su{" "}
        <strong>consentimiento libre, específico, informado e inequívoco</strong>{" "}
        para que el Organizador trate los siguientes datos: nombre y apellido,
        correo electrónico, teléfono y número de cédula de identidad. Se
        registra además el panel desde el cual se escaneó el código QR, con
        fines exclusivamente estadísticos.
        <br />
        <br />
        <strong>Finalidad de esta primera autorización:</strong> administrar la
        Activación —validar la inscripción, verificar la unicidad, resolver la
        ruleta, notificar a los ganadores y gestionar la entrega del premio—. La
        base de licitud es el consentimiento otorgado al aceptar estas bases.
      </Seccion>

      <Seccion titulo="9. Comunicaciones comerciales (opcional y separada)">
        El formulario incluye una <strong>segunda casilla, independiente y no
        preseleccionada</strong>, mediante la cual el participante puede
        autorizar el envío de comunicaciones comerciales. Esa autorización:
        <br />
        <br />
        <strong>(a)</strong> es enteramente voluntaria y{" "}
        <strong>no condiciona la participación en el sorteo</strong>: quien no
        la marque participa exactamente en las mismas condiciones;
        <br />
        <strong>(b)</strong> constituye una finalidad distinta de la del punto
        8, conforme a la exigencia de especificidad de la Ley N° 21.719; y
        <br />
        <strong>(c)</strong> puede retirarse en cualquier momento, sin
        expresión de causa, escribiendo a{" "}
        <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>, y también desde
        el enlace de baja incluido en cada comunicación.
        <br />
        <br />
        Bajo esta autorización, el <strong>único responsable</strong> del
        tratamiento sigue siendo el Organizador, que envía las comunicaciones por
        su cuenta y referidas a la Activación y a las marcas de la campaña. Esta
        autorización <strong>no implica una cesión de los datos</strong> a Betano
        ni a ningún otro tercero en calidad de responsable; si el Organizador
        quisiera hacerlo, tendría que solicitar antes un consentimiento nuevo y
        separado.
        <br />
        <br />
        Sí intervienen <strong>encargados del tratamiento</strong>, que actúan por
        cuenta y bajo instrucción del Organizador y no pueden usar los datos para
        fines propios: los proveedores de infraestructura de base de datos, de
        alojamiento de la aplicación y de envío de correo electrónico. Algunos de
        esos proveedores almacenan o procesan los datos{" "}
        <strong>fuera de Chile</strong>, lo que implica una transferencia
        internacional amparada en cláusulas contractuales que imponen al proveedor
        un nivel de protección equivalente al de la Ley N° 21.719.
      </Seccion>

      <Seccion titulo="10. Plazo de conservación">
        Los datos tratados con la finalidad del punto 8 se conservan durante la
        Activación y se eliminan a más tardar{" "}
        <strong>12 meses después del término del período de inscripción</strong>.
        Ese plazo cubre la entrega de los premios y el tiempo razonable para
        atender un reclamo o una fiscalización sobre el resultado del sorteo, y se
        extiende solo si una obligación legal exige conservarlos por más tiempo.
        <br />
        <br />
        Los datos de quienes hayan otorgado además la autorización del punto 9
        se conservan para esa finalidad hasta{" "}
        <strong>24 meses</strong> o hasta que la persona retire su consentimiento,
        lo que ocurra primero. Retirar esa autorización no afecta la validez de la
        participación en el sorteo.
      </Seccion>

      <Seccion titulo="11. Seguridad">
        Los datos se almacenan en infraestructura con acceso restringido y
        controles de seguridad. El acceso al panel de administración está
        protegido por autenticación, y las operaciones sobre los registros
        quedan trazadas. Las inscripciones no se eliminan físicamente durante la
        Activación: las que se dan de baja quedan marcadas como no elegibles,
        para poder acreditar quién participó y bajo qué condiciones.
      </Seccion>

      <Seccion titulo="12. Derechos del titular">
        El participante puede solicitar en cualquier momento el acceso, la
        rectificación, la supresión, la oposición, la portabilidad y el bloqueo
        de sus datos escribiendo a{" "}
        <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>, indicando su
        nombre y RUT para poder verificar su identidad. La solicitud se responde
        dentro del plazo que establece la ley y, en todo caso, dentro de{" "}
        <strong>30 días corridos</strong> desde su recepción. Asimismo, puede
        reclamar ante la autoridad de protección de datos personales.
      </Seccion>

      <Seccion titulo="13. Exclusivo para mayores de 18 años · Juego responsable">
        Esta Activación es una promoción de una marca de apuestas y está
        dirigida <strong>exclusivamente a personas mayores de 18 años</strong>.
        La inscripción de menores de edad está prohibida sin excepción, y el
        Organizador se reserva el derecho de exigir la presentación de documento
        de identidad vigente para la entrega del premio. El incumplimiento de
        este requisito faculta al Organizador para denegar la entrega sin
        derecho a compensación, reembolso ni reclamo de ningún tipo.
        <br />
        <br />
        Juega con responsabilidad. Si el juego dejó de ser entretenimiento, busca
        ayuda: puedes conversarlo con un profesional de salud mental o consultar a
        tu prestador de salud, y limitar o suspender tu actividad de juego en
        cualquier momento.
      </Seccion>

      <Seccion titulo="14. Aceptación y modificaciones">
        La participación implica la aceptación íntegra de estas bases. El
        Organizador podrá modificarlas por causa justificada, informando a
        través de los mismos canales de la Activación. Cualquier controversia se
        rige por la legislación chilena.
      </Seccion>

      <p
        style={{
          margin: "36px 0 0",
          fontSize: 12.5,
          color: "rgba(249,241,233,.62)",
        }}
      >
        Última actualización: 19 de agosto de 2026. Documento preparado conforme
        a la Ley N° 21.719.
      </p>

      <div
        style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: "1px solid rgba(138,60,24,.45)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 12.5,
          color: "rgba(249,241,233,.62)",
        }}
      >
        <Badge18 size={30} />
        <span>
          Solo mayores de 18 años. Juega con responsabilidad.{" "}
          <Link href="/i">Volver a la promoción</Link>
        </span>
      </div>
    </main>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          margin: "0 0 8px",
          fontFamily: "var(--font-title)",
          fontWeight: 800,
          fontSize: 15,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--color-bone)",
        }}
      >
        {titulo}
      </h2>
      <p style={{ margin: 0, color: "rgba(249,241,233,.82)" }}>{children}</p>
    </section>
  );
}
