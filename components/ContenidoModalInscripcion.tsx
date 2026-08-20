"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge18 } from "./Badge18";
import { BetanoLogo } from "./Lockup";
import { FormularioInscripcion } from "./FormularioInscripcion";
import { PasosPerfume, SelloConfirmado } from "./Confirmacion";
import { InfoBadge } from "./InfoBadge";
import { CORREO_DATOS } from "@/lib/contacto";

/**
 * Contenido del modal: formulario y, tras el alta, la confirmación EN SU SITIO.
 *
 * Antes el envío navegaba a /listo, así que el modal se cerraba y aparecía la
 * pantalla completa. Para quien está en escritorio eso es un salto brusco justo
 * en el momento en que acaba de entregar sus datos y necesita ver que llegaron:
 * la pantalla de atrás desaparece y ya no hay relación visible entre lo que
 * hizo y lo que ve.
 *
 * La confirmación se compone con las mismas piezas que /listo, no con una copia
 * de su texto.
 */
export function ContenidoModalInscripcion({ origen }: { origen: string }) {
  const router = useRouter();
  const [correo, setCorreo] = useState<string | null>(null);
  const [sorteo, setSorteo] = useState<string | undefined>(undefined);

  if (correo !== null) {
    return (
      <>
        <div id="modal-titulo">
          <SelloConfirmado email={correo} compacto />
        </div>

        <PasosPerfume compacto />

        {/* Las mismas placas que /listo: hay un sorteo por día, y quien se
            inscribe después de las 21:00 entra al del día siguiente. Esta
            superficie no puede callar lo que dice la otra. */}
        <div style={estiloPlacas}>
          <InfoBadge
            label="Sorteo"
            value={sorteo ?? "Fecha por definir"}
            pending={!sorteo}
          />
          {/* Decisión 03 del brief: el premio sigue sin definirse. */}
          <InfoBadge label="Premio" value="Por definir" pending />
        </div>

        <p style={estiloTexto}>
          No revisamos tu bandeja de spam por ti. Si no llega, escríbenos a{" "}
          <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>.
        </p>

        {/* back() y no push("/i"): la portada sigue montada detrás del modal,
            así que retroceder la devuelve tal como estaba, sin recargarla. */}
        <button type="button" onClick={() => router.back()} style={estiloBoton}>
          Listo
        </button>
      </>
    );
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
          Deja tus datos y entra al sorteo
        </h1>
        <p style={estiloTexto}>
          Un minuto y listo. La confirmación te llega al correo.
        </p>
      </div>

      <FormularioInscripcion
        origen={origen}
        alExito={(email, jornada) => {
          setSorteo(jornada);
          setCorreo(email);
        }}
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

/* Dos columnas iguales, como en /listo: las dos placas son del mismo rango. */
const estiloPlacas: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const estiloTexto: React.CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  lineHeight: 1.55,
  color: "rgba(255,255,255,.8)",
};

const estiloBoton: React.CSSProperties = {
  height: 52,
  background: "var(--cta-fondo, var(--color-ink))",
  color: "var(--cta-texto, var(--color-bone))",
  border: "none",
  borderRadius: 4,
  fontFamily: "var(--font-title)",
  fontWeight: 800,
  fontSize: 14,
  letterSpacing: ".16em",
  textTransform: "uppercase",
  cursor: "pointer",
};
