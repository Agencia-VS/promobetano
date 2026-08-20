"use client";

import { useState } from "react";
import { Badge18 } from "./Badge18";
import { BetanoLogo } from "./Lockup";
import { FormularioInscripcion } from "./FormularioInscripcion";
import { ResultadoRuleta } from "./ResultadoRuleta";
import { AvisoPruebas } from "./AvisoPruebas";
import { CORREO_DATOS } from "@/lib/contacto";
import type { Confirmado } from "@/lib/confirmado";

/**
 * Contenido del modal: formulario y, tras el alta, ruleta y resultado EN SU SITIO.
 *
 * Antes el envío navegaba a /listo, así que el modal se cerraba y aparecía la
 * pantalla completa. Para quien está en escritorio eso es un salto brusco justo
 * en el momento en que acaba de entregar sus datos y necesita ver que llegaron:
 * la pantalla de atrás desaparece y ya no hay relación visible entre lo que
 * hizo y lo que ve.
 *
 * El resultado usa la misma pieza que /listo, no una copia de su texto.
 */
export function ContenidoModalInscripcion({
  origen,
  pruebas = false,
}: {
  origen: string;
  /** Ensayo en curso: el aviso tiene que aparecer también acá. Esta superficie
      no puede callar lo que dice la ruta completa. */
  pruebas?: boolean;
}) {
  const [resultado, setResultado] = useState<Confirmado | null>(null);

  if (resultado !== null) {
    return <ResultadoRuleta resultado={resultado} compacto />;
  }

  return (
    <>
      {/* La marca vuelve a aparecer acá porque el modal tapa la portada: quien
          está llenando el formulario ya no ve el lockup que lo trajo, y un
          panel con cuatro campos y tres consentimientos sin ninguna firma
          visible se parece demasiado a cualquier otro formulario. */}
      <div
        className="modal-fila-marca"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Badge18 size={26} />
          <span style={estiloAntetitulo}>Inscripción</span>
        </div>
        <BetanoLogo width={104} sizes="104px" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 id="modal-titulo" style={estiloTitulo}>
          Deja tus datos y gira la ruleta
        </h1>
        <p style={estiloTexto}>
          El resultado es inmediato. Solo enviamos correo si ganas.
        </p>
      </div>

      {pruebas && <AvisoPruebas />}

      <FormularioInscripcion
        origen={origen}
        alExito={setResultado}
      />

      <p style={{ ...estiloTexto, fontSize: 11.5 }}>
        Juega con responsabilidad. Consultas de datos personales:{" "}
        <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>
      </p>
    </>
  );
}

const estiloAntetitulo: React.CSSProperties = {
  fontFamily: "var(--font-title)",
  fontSize: 10.5,
  letterSpacing: ".3em",
  textTransform: "uppercase",
  color: "#FFFFFF",
};

const estiloTitulo: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-title)",
  fontWeight: 800,
  fontSize: "clamp(24px, 5vw, 28px)",
  lineHeight: 1.04,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: "#FFFFFF",
};

const estiloTexto: React.CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  lineHeight: 1.55,
  color: "rgba(255,255,255,.8)",
};
