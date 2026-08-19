import Link from "next/link";
import { headers } from "next/headers";
import { ModalInscripcion } from "@/components/ModalInscripcion";
import { FormularioInscripcion } from "@/components/FormularioInscripcion";
import { Badge18 } from "@/components/Badge18";
import { HEADER_ORIGEN, ORIGEN_DIRECTO } from "@/lib/origen";
import { textoCierre } from "@/lib/concurso";
import { estadoVigente } from "@/lib/concurso-servidor";
import { CORREO_DATOS } from "@/lib/contacto";

export const dynamic = "force-dynamic";

/**
 * Ruta interceptora: intercepta /inscripcion cuando se llega navegando desde
 * la portada y la pinta como modal sobre ella.
 *
 * `(.)` y no `(..)` porque @modal es una ranura, no un segmento: /inscripcion
 * queda al mismo nivel pese a estar dos carpetas más arriba en el disco.
 *
 * Una visita directa, una recarga o un enlace compartido NO pasan por acá: los
 * atiende app/inscripcion/page.tsx a pantalla completa.
 */
export default async function ModalInscripcionPage() {
  const h = await headers();
  const origen = h.get(HEADER_ORIGEN) ?? ORIGEN_DIRECTO;
  const { estado, fuente } = await estadoVigente();

  if (estado !== "abierto") {
    const { titulo, detalle } = textoCierre(estado, fuente);
    return (
      <ModalInscripcion>
        <h1 id="modal-titulo" style={estiloTitulo}>
          {titulo}
        </h1>
        <p style={estiloTexto}>{detalle}</p>
        <Link href="/i" style={estiloVolver}>
          Volver
        </Link>
      </ModalInscripcion>
    );
  }

  return (
    <ModalInscripcion>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Badge18 size={26} />
        <span style={estiloAntetitulo}>Inscripción</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 id="modal-titulo" style={estiloTitulo}>
          Deja tus datos y entra al sorteo
        </h1>
        <p style={estiloTexto}>
          Un minuto y listo. La confirmación te llega al correo.
        </p>
      </div>

      <FormularioInscripcion origen={origen} />

      <p style={{ ...estiloTexto, fontSize: 11.5 }}>
        Juega con responsabilidad. Consultas de datos personales:{" "}
        <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>
      </p>
    </ModalInscripcion>
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

const estiloVolver: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 52,
  background: "var(--color-ink)",
  color: "var(--color-bone)",
  fontFamily: "var(--font-title)",
  fontWeight: 800,
  fontSize: 14,
  letterSpacing: ".16em",
  textTransform: "uppercase",
  borderRadius: 4,
  textDecoration: "none",
};
