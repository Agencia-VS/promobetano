import Link from "next/link";
import type { Metadata } from "next";
import { Badge18 } from "@/components/Badge18";
import { CORREO_DATOS } from "@/lib/contacto";

export const metadata: Metadata = {
  title: "Bases y condiciones — Eau de Confianza",
  robots: { index: false },
};

/*
 * Esta ruta existe porque la casilla de consentimiento del formulario es
 * OBLIGATORIA y enlazaba a /bases, que daba 404: se pedía aceptar términos que
 * el usuario no podía leer, lo que hace inexigible el consentimiento.
 *
 * ⚠️ BLOQUEANTE PARA PRODUCCIÓN: el contenido de abajo es un andamio con la
 * estructura que exige la Ley 21.719. Cada [PENDIENTE] es un dato que solo el
 * cliente puede definir, y el texto completo necesita revisión de un abogado
 * antes de publicar (brief §Legal y cumplimiento, §Qué falta 03 y 09).
 */

const PENDIENTE = "[PENDIENTE]";

export default function BasesPage() {
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
          margin: "0 0 28px",
          padding: "14px 16px",
          border: "1px solid var(--color-confianza)",
          background: "rgba(255,57,0,.1)",
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      >
        <strong>Borrador referencial, no publicable.</strong> Este documento
        todavía no fue revisado por un abogado y contiene datos sin definir. No
        constituye asesoría legal.
      </p>

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
        Eau de Confianza
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
        Bases y condiciones
      </h1>

      <Seccion titulo="1. Responsable del tratamiento">
        El responsable de decidir la finalidad del tratamiento de tus datos es{" "}
        <Dato>{PENDIENTE}: razón social, RUT y domicilio</Dato>. La operación
        técnica la realiza <Dato>{PENDIENTE}: encargado del tratamiento</Dato>,
        bajo un acuerdo de tratamiento de datos.
      </Seccion>

      <Seccion titulo="2. Quién puede participar">
        Personas naturales mayores de 18 años con cédula de identidad chilena o
        documento extranjero válido, residentes en Chile. Quedan excluidos{" "}
        <Dato>{PENDIENTE}: exclusiones (trabajadores, agencias, familiares)</Dato>
        . La declaración de mayoría de edad es obligatoria para inscribirse.
      </Seccion>

      <Seccion titulo="3. Vigencia y mecánica">
        La activación se realiza entre <Dato>{PENDIENTE}: fecha de inicio</Dato> y{" "}
        <Dato>{PENDIENTE}: fecha de término</Dato>. Se participa completando el
        formulario de inscripción una sola vez por persona; la unicidad se
        determina por RUT y por correo electrónico normalizados.
      </Seccion>

      <Seccion titulo="4. Sorteo, premios y suplentes">
        El sorteo se realiza el <Dato>{PENDIENTE}: fecha del sorteo</Dato> mediante
        un procedimiento aleatorio reproducible y auditable, con semilla
        registrada. Se sortean <Dato>{PENDIENTE}: cantidad de ganadores</Dato>{" "}
        ganadores y <Dato>{PENDIENTE}: cantidad de suplentes</Dato> suplentes. El
        premio consiste en <Dato>{PENDIENTE}: descripción y valor del premio</Dato>
        . Si un ganador no responde o declina dentro de{" "}
        <Dato>{PENDIENTE}: plazo</Dato>, el premio pasa al siguiente suplente,
        dejando registro del reemplazo.
      </Seccion>

      <Seccion titulo="5. Datos que tratamos y para qué">
        Tratamos tu nombre y apellido, correo electrónico, teléfono y número de
        documento con la finalidad exclusiva de administrar esta activación:
        verificar unicidad, ejecutar el sorteo y contactar a los ganadores. La
        base de licitud es tu consentimiento, otorgado al aceptar estas bases.
      </Seccion>

      <Seccion titulo="6. Comunicaciones comerciales (opcional)">
        El envío de promociones de Betano requiere un consentimiento separado y
        específico, que puedes otorgar o no sin que afecte tu participación en el
        sorteo. Puedes retirarlo en cualquier momento escribiendo a{" "}
        <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>.
      </Seccion>

      <Seccion titulo="7. Plazo de conservación">
        Tus datos se eliminan a más tardar el{" "}
        <Dato>{PENDIENTE}: fecha concreta de eliminación posterior a la entrega
        de premios</Dato>, salvo obligación legal de conservarlos por más tiempo.
      </Seccion>

      <Seccion titulo="8. Tus derechos">
        Puedes solicitar acceso, rectificación, supresión, oposición,
        portabilidad y bloqueo de tus datos escribiendo a{" "}
        <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>. Responderemos
        dentro de <Dato>{PENDIENTE}: plazo de respuesta</Dato>. También puedes
        reclamar ante la autoridad de protección de datos.
      </Seccion>

      <Seccion titulo="9. Juego responsable">
        Esta es una promoción de una casa de apuestas y está dirigida
        exclusivamente a personas mayores de 18 años. Juega con responsabilidad.
        Si el juego dejó de ser entretenimiento, busca ayuda en{" "}
        <Dato>{PENDIENTE}: canal de ayuda de juego responsable</Dato>.
      </Seccion>

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
          Solo mayores de 18 años. <Link href="/i">Volver a la promoción</Link>
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
