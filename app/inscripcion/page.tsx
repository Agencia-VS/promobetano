import Link from "next/link";
import { headers } from "next/headers";
import { FormularioInscripcion } from "@/components/FormularioInscripcion";
import { Screen } from "@/components/Screen";
import { Lockup, BetanoLogo } from "@/components/Lockup";
import { Footer18 } from "@/components/Footer18";
import { Badge18 } from "@/components/Badge18";
import { AvisoPruebas } from "@/components/AvisoPruebas";
import { HEADER_ORIGEN, ORIGEN_DIRECTO } from "@/lib/origen";
import { textoCierre } from "@/lib/concurso";
import { estadoVigente } from "@/lib/concurso-servidor";
import { CORREO_DATOS } from "@/lib/contacto";

// La ventana se evalúa contra el reloj de cada visita: esta ruta no puede
// prerenderizarse ni quedar cacheada, o seguiría aceptando inscripciones un día
// después del cierre.
export const dynamic = "force-dynamic";

/**
 * Formulario a pantalla completa.
 *
 * Sigue siendo una ruta real —no un estado de la portada— aunque en escritorio
 * se pinte como modal: una visita directa, un enlace compartido, una recarga o
 * un navegador que mató la pestaña en el mall aterrizan acá y funcionan. El
 * modal lo produce app/@modal/(.)inscripcion interceptando la navegación desde
 * la portada.
 */
export default async function InscripcionPage() {
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
      // Variante "listo" y no "formulario": esta pantalla es un mensaje corto y
      // el layout del formulario alinea arriba porque asume una columna alta.
      <Screen
        variant="listo"
        padTop={60}
        padX={24}
        poster={
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <Lockup
              width="clamp(240px, 24vw, 320px)"
              sizes="(min-width: 768px) 320px, 240px"
              priority
              className="centrado-movil"
              style={{ display: "block" }}
            />
            <h1 style={tituloCierre}>{titulo}</h1>
          </div>
        }
        accion={
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <p
              style={{
                margin: 0,
                fontSize: "clamp(15px, 1.1vw, 17px)",
                lineHeight: 1.6,
                color: "#FFFFFF",
                maxWidth: "34ch",
              }}
            >
              {detalle}
            </p>
            <Link href="/i" style={botonVolver}>
              Volver
            </Link>
          </div>
        }
        pie={
          <Footer18 topGap={8}>
            Juega con responsabilidad. Solo mayores de 18 años.{" "}
            <Link href="/bases">Bases y condiciones</Link>
          </Footer18>
        }
      />
    );
  }

  return (
    <Screen
      variant="formulario"
      padTop={60}
      padX={24}
      poster={
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="fila-marca">
            <BetanoLogo
              width="clamp(124px, 11vw, 158px)"
              sizes="(min-width: 768px) 158px, 124px"
            />
            <Badge18 size={28} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span
              style={{
                fontFamily: "var(--font-title)",
                fontSize: 10.5,
                letterSpacing: ".3em",
                textTransform: "uppercase",
                color: "#FFFFFF",
              }}
            >
              Inscripción
            </span>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-title)",
                fontWeight: 800,
                fontSize: "clamp(27px, 3vw, 40px)",
                lineHeight: 1.04,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                color: "#FFFFFF",
              }}
            >
              Deja tus datos y gira la ruleta
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "clamp(14.5px, 1.05vw, 17px)",
                lineHeight: 1.6,
                color: "#FFFFFF",
                maxWidth: "36ch",
              }}
            >
              El resultado es inmediato. Solo enviamos correo si ganas.
            </p>

            {/* Va con el titular y no junto al botón: quien llega tiene que
                leerlo antes de escribir su RUT, no después de escribirlo. */}
            {pruebas && <AvisoPruebas />}
          </div>
        </div>
      }
      accion={<FormularioInscripcion origen={origen} />}
      pie={
        <Footer18 topGap={8}>
          Juega con responsabilidad. Consultas de datos personales:{" "}
          <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>
        </Footer18>
      }
    />
  );
}

const tituloCierre: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-title)",
  fontWeight: 800,
  fontSize: "clamp(27px, 3vw, 40px)",
  lineHeight: 1.04,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: "#FFFFFF",
};

const botonVolver: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 56,
  maxWidth: 420,
  background: "var(--color-ink)",
  color: "var(--color-bone)",
  fontFamily: "var(--font-title)",
  fontWeight: 800,
  fontSize: 15.5,
  letterSpacing: ".16em",
  textTransform: "uppercase",
  borderRadius: 3,
  textDecoration: "none",
};
