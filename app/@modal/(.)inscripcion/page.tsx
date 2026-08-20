import Link from "next/link";
import { headers } from "next/headers";
import { ContenidoModalInscripcion } from "@/components/ContenidoModalInscripcion";
import { HEADER_ORIGEN, ORIGEN_DIRECTO } from "@/lib/origen";
import { textoCierre } from "@/lib/concurso";
import { estadoVigente } from "@/lib/concurso-servidor";

export const dynamic = "force-dynamic";

/**
 * Ruta interceptora: intercepta /inscripcion cuando se llega navegando desde la
 * portada y la pinta como modal sobre ella.
 *
 * `(.)` y no `(..)` porque @modal es una ranura, no un segmento: /inscripcion
 * queda al mismo nivel pese a estar dos carpetas más arriba en el disco.
 *
 * Una visita directa, una recarga o un enlace compartido NO pasan por acá: los
 * atiende app/inscripcion/page.tsx a pantalla completa.
 *
 * El marco <ModalInscripcion> lo pone layout.tsx, no esta página: acá se lee el
 * interruptor del concurso, y eso obliga a render dinámico. Con el marco dentro,
 * al tocar el botón no se pintaba nada hasta que el servidor contestaba.
 */
export default async function ModalInscripcionPage() {
  const h = await headers();
  const origen = h.get(HEADER_ORIGEN) ?? ORIGEN_DIRECTO;
  const { estado, fuente, pruebas, ventanaDesde, ventanaHasta } =
    await estadoVigente();

  if (estado !== "abierto") {
    const { titulo, detalle } = textoCierre(estado, fuente, {
      desde: ventanaDesde,
      hasta: ventanaHasta,
    });
    return (
      <>
        <h1 id="modal-titulo" style={estiloTitulo}>
          {titulo}
        </h1>
        <p style={estiloTexto}>{detalle}</p>
        <Link href="/i" style={estiloVolver}>
          Volver
        </Link>
      </>
    );
  }

  return <ContenidoModalInscripcion origen={origen} pruebas={pruebas} />;
}

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
  background: "var(--cta-fondo, var(--color-ink))",
  color: "var(--cta-texto, var(--color-bone))",
  fontFamily: "var(--font-title)",
  fontWeight: 800,
  fontSize: 14,
  letterSpacing: ".16em",
  textTransform: "uppercase",
  borderRadius: 4,
  textDecoration: "none",
};
