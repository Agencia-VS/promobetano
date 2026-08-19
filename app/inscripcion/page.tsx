import Link from "next/link";
import { headers } from "next/headers";
import { FormularioInscripcion } from "@/components/FormularioInscripcion";
import { Screen } from "@/components/Screen";
import { Lockup } from "@/components/Lockup";
import { Footer18 } from "@/components/Footer18";
import { HEADER_ORIGEN, ORIGEN_DIRECTO } from "@/lib/origen";
import { cierre, estadoConcurso, fechaYHora, inicio } from "@/lib/concurso";

// La ventana se evalúa contra el reloj de cada visita: esta ruta no puede
// prerenderizarse ni quedar cacheada, o seguiría aceptando inscripciones un día
// después del cierre.
export const dynamic = "force-dynamic";

/**
 * El origen lo resuelve proxy.ts (la URL manda sobre la cookie) y llega por
 * header. Antes esta página parseaba el ?p= por su cuenta y el cliente leía la
 * cookie con la precedencia invertida.
 */
export default async function InscripcionPage() {
  const h = await headers();
  const origen = h.get(HEADER_ORIGEN) ?? ORIGEN_DIRECTO;
  const estado = estadoConcurso();

  if (estado === "abierto") {
    return <FormularioInscripcion origen={origen} />;
  }

  /*
   * Cerrado o todavía sin abrir: la puerta se cierra en el servidor, no
   * escondiendo el botón. La ruta de API vuelve a comprobarlo, porque quien
   * tenga el formulario abierto desde antes del cierre igual puede enviarlo.
   *
   * `sin_configurar` cae acá a propósito. Si faltan las fechas, lo correcto es
   * no aceptar inscripciones —y que alguien lo note— y no aceptarlas para
   * siempre porque nadie cargó la variable.
   */
  const desde = inicio();
  const hasta = cierre();

  const titulo =
    estado === "antes" ? "Todavía no abrimos" : "Las inscripciones cerraron";

  const detalle =
    estado === "antes" && desde
      ? `Las inscripciones abren el ${fechaYHora(desde)}. Vuelve a escanear el código ese día.`
      : estado === "cerrado" && hasta
        ? `El plazo terminó el ${fechaYHora(hasta)}. Gracias por pasar.`
        : "En cuanto haya fechas confirmadas las publicamos acá.";

  return (
    // Variante "listo" y no "formulario": esta pantalla es un mensaje corto, y
    // el layout del formulario alinea arriba porque asume una columna alta:
    // dejaba el texto pegado al techo con medio viewport vacío debajo. Y va a
    // ser lo que vea todo el que escanee el QR hasta que abra la ventana.
    <Screen
      variant="listo"
      padTop={60}
      padX={24}
      poster={
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Lockup
            width="clamp(240px, 24vw, 320px)"
            sizes="(min-width: 1024px) 320px, 240px"
            priority
            className="centrado-movil"
            style={{ display: "block" }}
          />
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
            {titulo}
          </h1>
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
          <Link
            href="/i"
            style={{
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
            }}
          >
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
