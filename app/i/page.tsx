import Link from "next/link";
import { headers } from "next/headers";
import { Screen } from "@/components/Screen";
import { Lockup } from "@/components/Lockup";
import { Footer18 } from "@/components/Footer18";
import { InfoBadge } from "@/components/InfoBadge";
import { HEADER_ORIGEN, ORIGEN_DIRECTO, etiquetaPanel } from "@/lib/origen";

export default async function PortadaPage() {
  const h = await headers();
  const origen = h.get(HEADER_ORIGEN) ?? ORIGEN_DIRECTO;

  return (
    <Screen variant="portada" padTop={66} padX={26}>
      <Lockup
        width={268}
        priority
        style={{ margin: "34px auto 8px", display: "block" }}
      />

      <h1
        style={{
          margin: "26px 0 0",
          fontFamily: "var(--font-title)",
          fontWeight: 800,
          fontSize: 25,
          lineHeight: 1.06,
          letterSpacing: ".055em",
          textTransform: "uppercase",
          color: "#FFFFFF",
          textWrap: "pretty",
        }}
      >
        Hay un aroma para el momento en que decides confiar en ti
      </h1>

      <p
        style={{
          margin: "26px 0 0",
          fontSize: 15.5,
          lineHeight: 1.65,
          color: "#FFFFFF",
          maxWidth: "32ch",
        }}
      >
        Un perfume único en su tipo, elaborado con aromas científicamente
        comprobados para hacerte sentir más seguro.
      </p>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 26,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {/* TODO(§Qué falta 01–02): fecha del sorteo. */}
        <InfoBadge label="Sorteo" value="Fecha por definir" pending />
        {/* TODO(§Qué falta 05): lista de paneles en lib/origen.ts. */}
        <InfoBadge label="Estás en" value={etiquetaPanel(origen)} pending />
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

      <Footer18 topGap={10}>
        Juega con responsabilidad. Solo mayores de 18 años.{" "}
        <Link href="/bases">Bases y condiciones</Link>
      </Footer18>
    </Screen>
  );
}
