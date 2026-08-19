import Link from "next/link";
import type { Metadata } from "next";
import { Badge18 } from "@/components/Badge18";
import { CORREO_DATOS } from "@/lib/contacto";
import { cierre, fechaYHora, inicio } from "@/lib/concurso";

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
 * El banner de "borrador no publicable" se quitó por indicación del cliente: el
 * documento del que se adaptó ya pasó por revisión de abogados.
 *
 * ⚠️ Lo que SIGUE bloqueando el enlace público son las marcas [PENDIENTE]: se
 * renderizan visibles y subrayadas, así que hoy una persona que abra /bases lee
 * "[PENDIENTE]: fecha del sorteo" donde debería ir la fecha. Cada una es un
 * dato que solo el cliente puede definir (AGENTS.md §5, decisiones 01, 03, 04,
 * 07 y 09); no se inventan.
 */

const PENDIENTE = "[PENDIENTE]";

// Las fechas salen de las variables de entorno, igual que el resto del sitio:
// si el cierre se mueve en Vercel, las bases publicadas se mueven con él y no
// quedan contradiciendo al formulario.
export const dynamic = "force-dynamic";

export default function BasesPage() {
  const desde = inicio();
  const hasta = cierre();

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
        El rol de <strong>Betano</strong> en el tratamiento —si recibe los datos
        de quienes acepten recibir comunicaciones comerciales y bajo qué
        calidad— es <Dato>{PENDIENTE}: definir si Betano es cesionario,
        corresponsable o ninguno de los dos</Dato>. Ver la sección 9.
      </Seccion>

      <Seccion titulo="2. En qué consiste la Activación">
        La Activación se difunde mediante códigos QR ubicados en paneles
        publicitarios. Al escanearlo, la persona accede a un formulario de
        inscripción; completándolo, queda incorporada al sorteo descrito en la
        sección 5. La participación es gratuita y no requiere compra ni
        contratación de ningún producto ni servicio.
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
        relacionadas, así como el encargado del tratamiento. Se excluye además a{" "}
        <Dato>{PENDIENTE}: confirmar si se excluye a trabajadores de Betano y a
        familiares directos de los excluidos</Dato>.
        <br />
        <br />
        Pueden participar residentes de cualquier región del país. Cualquier
        gasto de traslado u otro asociado a recibir el premio es de cargo
        exclusivo del ganador, salvo que estas bases digan expresamente lo
        contrario en la sección 6.
      </Seccion>

      <Seccion titulo="4. Vigencia">
        El período de inscripción se extiende desde el{" "}
        {desde ? (
          <strong>{fechaYHora(desde)}</strong>
        ) : (
          <Dato>{PENDIENTE}: fecha y hora de inicio</Dato>
        )}{" "}
        hasta el{" "}
        {hasta ? (
          <strong>{fechaYHora(hasta)}</strong>
        ) : (
          <Dato>{PENDIENTE}: fecha y hora de término</Dato>
        )}
        , en horario de Chile continental. Las inscripciones recibidas fuera de
        ese período no participan.
        <br />
        <br />
        Cada persona puede inscribirse <strong>una sola vez</strong>. La
        unicidad se determina por RUT y por correo electrónico en su forma
        normalizada, de modo que las variantes de escritura del mismo dato
        —puntos, guiones, ceros a la izquierda, mayúsculas— se reconocen como
        una única inscripción. Las inscripciones duplicadas o con datos falsos
        se descartan.
      </Seccion>

      <Seccion titulo="5. Sorteo, ganadores y suplentes">
        Cerrado el período de inscripción, el Organizador realiza un{" "}
        <strong>sorteo aleatorio, reproducible y auditable</strong> entre las
        inscripciones válidas. El procedimiento usa una{" "}
        <strong>semilla registrada antes de ejecutarse</strong>: el orden de los
        participantes se deriva de esa semilla mediante una función
        determinista, y la lista completa de participantes queda congelada en el
        momento de la ejecución. Con ambos elementos, el resultado puede
        recalcularse y verificarse íntegramente con posterioridad.
        <br />
        <br />
        El sorteo se realiza el <Dato>{PENDIENTE}: fecha del sorteo</Dato>. Se
        sortean <Dato>{PENDIENTE}: cantidad de ganadores</Dato> ganadores y{" "}
        <Dato>{PENDIENTE}: cantidad de suplentes</Dato> suplentes, según el
        orden resultante.
        <br />
        <br />
        Quedan fuera del sorteo las inscripciones dadas de baja por
        incumplimiento de estas bases y aquellas cuyo correo electrónico resultó
        inválido o rebotó, por cuanto no permitirían notificar el premio.
      </Seccion>

      <Seccion titulo="6. Premio">
        El premio consiste en{" "}
        <Dato>{PENDIENTE}: descripción exacta, cantidad y valor del premio</Dato>
        . El premio es personal e intransferible, no es canjeable por dinero ni
        por otro premio, y no puede fraccionarse.
        <br />
        <br />
        La forma de entrega es{" "}
        <Dato>{PENDIENTE}: definir si hay canje presencial en un punto físico o
        despacho, y en su caso el plazo y el procedimiento de acreditación de
        identidad</Dato>.
      </Seccion>

      <Seccion titulo="7. Notificación a los ganadores">
        Los ganadores son contactados al correo electrónico registrado en su
        inscripción. Disponen de un plazo de{" "}
        <Dato>{PENDIENTE}: plazo de aceptación — en el concurso anterior fueron
        2 días corridos</Dato> desde el envío del correo para confirmar la
        aceptación del premio. Transcurrido ese plazo sin respuesta, se entiende
        que el ganador renuncia y el premio pasa al siguiente suplente según el
        orden del sorteo.
        <br />
        <br />
        Cada reemplazo queda registrado con indicación de quién declinó, quién
        lo sustituye y en qué momento, de manera que la trazabilidad del
        resultado se conserve completa.
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
        Activación —validar la inscripción, verificar la unicidad, ejecutar el
        sorteo, notificar a los ganadores y gestionar la entrega del premio—. La
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
        Los destinatarios de los datos bajo esta autorización, y si ello importa
        una cesión a un tercero, es{" "}
        <Dato>{PENDIENTE}: definir si los datos se transfieren a Betano o a un
        CRM operado por Betano; de ser así hay que identificarlo expresamente
        acá, porque una cesión no informada invalida el consentimiento</Dato>.
      </Seccion>

      <Seccion titulo="10. Plazo de conservación">
        Los datos tratados con la finalidad del punto 8 se conservan durante la
        Activación y se eliminan a más tardar el{" "}
        <Dato>{PENDIENTE}: fecha concreta, posterior a la entrega de los
        premios</Dato>, salvo obligación legal que exija conservarlos por más
        tiempo.
        <br />
        <br />
        Los datos de quienes hayan otorgado además la autorización del punto 9
        se conservan para esa finalidad{" "}
        <Dato>{PENDIENTE}: plazo de conservación para comunicaciones
        comerciales</Dato> o hasta que la persona retire su consentimiento, lo
        que ocurra primero. Retirar esa autorización no afecta la validez de la
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
        <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>. La solicitud se
        responde dentro de{" "}
        <Dato>{PENDIENTE}: plazo de respuesta comprometido</Dato>. Asimismo,
        puede reclamar ante la autoridad de protección de datos personales.
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
        Juega con responsabilidad. Si el juego dejó de ser entretenimiento,
        busca ayuda en{" "}
        <Dato>{PENDIENTE}: canal de ayuda de juego responsable que corresponda
        indicar en Chile</Dato>.
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
        Última actualización: 18 de agosto de 2026. Documento preparado conforme
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

/** Marca visualmente un dato que falta definir, para que no pase inadvertido. */
function Dato({ children }: { children: React.ReactNode }) {
  return (
    <mark
      style={{
        background: "rgba(255,57,0,.16)",
        color: "var(--color-bone)",
        padding: "0 4px",
        borderBottom: "1px dashed rgba(255,57,0,.7)",
      }}
    >
      {children}
    </mark>
  );
}
