import Link from "next/link";
import { Screen } from "@/components/Screen";
import { Lockup } from "@/components/Lockup";
import { Footer18 } from "@/components/Footer18";
import { InfoBadge } from "@/components/InfoBadge";
import { SEDE } from "@/lib/campana";
import { fechaCorta } from "@/lib/concurso";
import { estadoVigente } from "@/lib/concurso-servidor";

// La placa muestra la ventana de inscripción contra el reloj de cada visita.
export const dynamic = "force-dynamic";

export default async function PortadaPage() {
  // La placa refleja el estado vigente, interruptor manual incluido: si el
  // equipo cierra a mano, la portada no puede seguir invitando a inscribirse.
  const { estado, ventanaDesde, ventanaHasta } = await estadoVigente();
  const ventana =
    estado === "abierto"
      ? ventanaHasta
        ? `Hasta el ${fechaCorta(ventanaHasta)}`
        : "Abiertas"
      : estado === "antes"
        ? ventanaDesde
          ? `Abren el ${fechaCorta(ventanaDesde)}`
          : "Abren pronto"
        : estado === "cerrado"
          ? "Cerradas"
          : null;

  return (
    <Screen
      variant="portada"
      padTop={66}
      padX={26}
      poster={
        <>
          <Lockup
            width="clamp(268px, 26vw, 336px)"
            sizes="(min-width: 768px) 336px, 268px"
            priority
            className="centrado-movil"
            // El centrado horizontal lo pone .centrado-movil, que en escritorio lo
            // cancela; un `margin` shorthand acá pisaría esa clase.
            style={{ marginTop: 34, marginBottom: 8, display: "block" }}
          />

          <p
            style={{
              margin: "26px 0 0",
              fontFamily: "var(--font-title)",
              fontWeight: 600,
              fontSize: "clamp(11px, 1vw, 13px)",
              lineHeight: 1.45,
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,.82)",
              maxWidth: "42ch",
              textWrap: "pretty",
            }}
          >
            Hay un aroma para el momento en que decides confiar en ti
          </p>

          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: "clamp(27px, 3.45vw, 47px)",
              lineHeight: 1.02,
              letterSpacing: ".045em",
              textTransform: "uppercase",
              color: "#FFFFFF",
              textWrap: "balance",
            }}
          >
            Confía y participa por 1 de los 90 Eau de Confianza
          </h1>

          <p
            style={{
              margin: "26px 0 0",
              fontSize: "clamp(15.5px, 1.15vw, 18px)",
              lineHeight: 1.65,
              color: "#FFFFFF",
              maxWidth: "38ch",
            }}
          >
            Un perfume único en su tipo, elaborado con aromas científicamente
            comprobados para hacerte sentir más seguro.
          </p>
        </>
      }
      accion={
        <>
          <div
            style={{
              paddingTop: 26,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <InfoBadge
              label="Inscripciones"
              value={ventana ?? "Fechas por definir"}
              pending={ventana === null}
            />
            {/* La sede es fija: toda la activación está en un mismo mall, así
                que es verdad también para quien llegó por un link compartido y
                no por el QR de un panel. El ?p= sigue resolviéndose en proxy.ts
                para la atribución; lo que no hace es decidir este texto, que
                antes quedaba en "Panel por definir" en la mayoría de las
                visitas. */}
            <InfoBadge label="Estás en" value={SEDE} />
          </div>

          <Link
            href="/inscripcion"
            style={{
              marginTop: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 56,
              background: "var(--color-ink)",
              color: "var(--color-bone)",
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: 15.5,
              letterSpacing: ".16em",
              textTransform: "uppercase",
              borderRadius: 3,
              boxShadow: "0 12px 32px rgba(60,0,0,.35)",
              textDecoration: "none",
            }}
          >
            Confía y dale
          </Link>
        </>
      }
      pie={
        <Footer18 topGap={10}>
          Juega con responsabilidad. Solo mayores de 18 años.{" "}
          <Link href="/bases">Bases y condiciones</Link>
        </Footer18>
      }
    />
  );
}
