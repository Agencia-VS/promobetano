"use client";

import { useState } from "react";
import { Screen } from "@/components/Screen";
import { Footer18 } from "@/components/Footer18";

type Confirmado = { email: string; origen: string } | null;

function leeConfirmado(): Confirmado {
  try {
    const raw = sessionStorage.getItem("edc_confirmado");
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Sin sessionStorage no hay forma de saber qué correo se envió; se
    // muestra el copy genérico más abajo.
    return null;
  }
}

export default function ListoPage() {
  // Lazy initializer en vez de efecto: en SSR no hay sessionStorage y cae a
  // `null` (copy genérico); el cliente lo corrige al hidratar.
  const [confirmado] = useState<Confirmado>(leeConfirmado);

  return (
    <Screen variant="listo">
      <div
        style={{
          position: "relative",
          flex: 1,
          boxSizing: "border-box",
          padding: "62px 26px 46px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "24px 0 8px" }}>
          <span
            style={{
              width: 60,
              height: 60,
              border: "1px solid rgba(255,255,255,.7)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              color: "#FFFFFF",
            }}
          >
            ✓
          </span>
          <h1 style={{ margin: 0, textAlign: "center", fontFamily: "var(--font-title)", fontWeight: 800, fontSize: 30, lineHeight: 1.04, letterSpacing: ".06em", textTransform: "uppercase", color: "#FFFFFF" }}>
            Quedaste dentro
          </h1>
          <p style={{ margin: 0, textAlign: "center", fontSize: 15, lineHeight: 1.6, color: "#FFFFFF", maxWidth: "30ch" }}>
            {confirmado?.email ? (
              <>
                Te mandamos la confirmación a{" "}
                <span style={{ color: "#FFFFFF", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  {confirmado.email}
                </span>
                . Llega en menos de un minuto.
              </>
            ) : (
              "Te mandamos la confirmación a tu correo. Llega en menos de un minuto."
            )}
          </p>
        </div>

        <div style={{ background: "var(--color-ink)", padding: "22px 20px", display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 14px 36px rgba(60,0,0,.4)" }}>
          <span style={{ fontFamily: "var(--font-title)", fontSize: 10.5, letterSpacing: ".3em", textTransform: "uppercase", color: "var(--color-confianza)" }}>
            Si te lo ganas, así se usa
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Paso n="01">Abre la botella.</Paso>
            <Paso n="02">Susúrrate: «tú puedes».</Paso>
            <Paso n="03">Échate bastante y con confianza.</Paso>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <InfoBadge label="Sorteo" value="Fecha por definir" title="Pendiente §Qué falta 02" />
          <InfoBadge label="Premio" value="Por definir" title="Pendiente §Qué falta 03" />
        </div>

        <p style={{ margin: "auto 0 0", fontSize: 13.5, lineHeight: 1.6, color: "#FFFFFF" }}>
          No revisamos tu bandeja de spam por ti. Si no llega, escríbenos a{" "}
          <a href="mailto:datos@dominio.cl" style={{ color: "#FFFFFF", textDecoration: "underline", textUnderlineOffset: 2 }}>
            datos@dominio.cl
          </a>
          .
        </p>

        <Footer18 topGap={0} sidePad={26}>
          Juega con responsabilidad.{" "}
          <a href="/bases" style={{ color: "#FFFFFF", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Bases y condiciones
          </a>
        </Footer18>
      </div>
    </Screen>
  );
}

function Paso({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      <span style={{ fontFamily: "var(--font-title)", fontWeight: 800, fontSize: 13, color: "var(--color-confianza)", minWidth: 18 }}>{n}</span>
      <span style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-bone)" }}>{children}</span>
    </div>
  );
}

function InfoBadge({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div style={{ border: "1px solid rgba(60,0,0,.4)", background: "rgba(60,0,0,.3)", padding: "11px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: "var(--font-title)", fontSize: 10, letterSpacing: ".26em", textTransform: "uppercase", color: "#FFFFFF" }}>{label}</span>
      <span title={title} style={{ fontSize: 13.5, color: "#FFFFFF", borderBottom: "1px dashed rgba(255,255,255,.5)", alignSelf: "flex-start" }}>{value}</span>
    </div>
  );
}
