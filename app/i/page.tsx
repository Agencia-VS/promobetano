import Link from "next/link";
import { Screen } from "@/components/Screen";
import { Lockup } from "@/components/Lockup";
import { Footer18 } from "@/components/Footer18";
import { GateOverlay } from "@/components/GateOverlay";
import { PersistOrigen } from "@/components/PersistOrigen";
import { ORIGEN_DEFAULT, origenNombre } from "@/lib/origen";

export default async function PortadaPage({
  searchParams,
}: PageProps<"/i">) {
  const params = await searchParams;
  const p = params.p;
  const slug = (Array.isArray(p) ? p[0] : p) || ORIGEN_DEFAULT;

  return (
    <Screen variant="portada">
      <PersistOrigen slug={slug} />
      <div
        style={{
          position: "relative",
          flex: 1,
          boxSizing: "border-box",
          padding: "66px 26px 46px",
          display: "flex",
          flexDirection: "column",
          gap: 26,
        }}
      >
        <Lockup
          width={268}
          height={118}
          style={{ margin: "34px 0 8px", alignSelf: "center" }}
        />

        <h1
          style={{
            margin: 0,
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

        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: "#FFFFFF", maxWidth: "32ch" }}>
          Un perfume único en su tipo, elaborado con aromas científicamente
          comprobados para hacerte sentir más seguro.
        </p>

        <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <InfoBadge label="Sorteo" value="Fecha por definir" pending title="Pendiente §Qué falta 01–02" />
          <InfoBadge label="Estás en" value={origenNombre(slug)} pending title="Pendiente §Qué falta 05" />
        </div>

        <Link
          href={`/inscripcion?p=${encodeURIComponent(slug)}`}
          style={{
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

        <Footer18 topGap={10} sidePad={26}>
          Juega con responsabilidad. Solo mayores de 18 años.{" "}
          <a href="/bases" style={{ color: "#FFFFFF", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Bases y condiciones
          </a>
        </Footer18>
      </div>

      <GateOverlay />
    </Screen>
  );
}

function InfoBadge({
  label,
  value,
  pending,
  title,
}: {
  label: string;
  value: string;
  pending?: boolean;
  title?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(60,0,0,.4)",
        background: "rgba(60,0,0,.3)",
        padding: "11px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-title)",
          fontSize: 10,
          letterSpacing: ".26em",
          textTransform: "uppercase",
          color: "#FFFFFF",
        }}
      >
        {label}
      </span>
      <span
        title={title}
        style={{
          fontSize: 13.5,
          color: "#FFFFFF",
          borderBottom: pending ? "1px dashed rgba(255,255,255,.5)" : undefined,
          alignSelf: "flex-start",
        }}
      >
        {value}
      </span>
    </div>
  );
}
