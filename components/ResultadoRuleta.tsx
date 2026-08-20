"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Confirmado } from "@/lib/confirmado";
import "@/styles/ruleta.css";

const DURACION_MS = 2800;

/**
 * La animación representa una decisión que YA tomó PostgreSQL. Nunca calcula
 * el resultado: retrasar el premio en el navegador no puede alterar stock,
 * folio ni correo, y recargar conserva exactamente la misma respuesta.
 */
export function ResultadoRuleta({
  resultado,
  compacto = false,
}: {
  resultado: Confirmado;
  compacto?: boolean;
}) {
  const [girando, setGirando] = useState(true);
  const [grados, setGrados] = useState(0);

  useEffect(() => {
    const reducido = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const vueltas = 6 + (bytes[0] % 4);
    const angulo = bytes[0] % 360;

    const frame = requestAnimationFrame(() => {
      setGrados(vueltas * 360 + angulo);
    });
    const timer = window.setTimeout(
      () => setGirando(false),
      reducido ? 350 : DURACION_MS,
    );

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  if (girando) {
    return (
      <section
        className={`ruleta ${compacto ? "ruleta--compacta" : ""}`}
        aria-live="polite"
        aria-busy="true"
      >
        <div>
          <span className="ruleta__antetitulo">Sorteo instantáneo</span>
          <h1 className="ruleta__titulo">Girando la ruleta…</h1>
          <p className="ruleta__texto">Tu resultado se está revelando.</p>
        </div>

        <div className="ruleta__marco" aria-hidden="true">
          <span className="ruleta__puntero" />
          <div
            className="ruleta__disco"
            style={{ "--giro-ruleta": `${grados}deg` } as CSSProperties}
          >
            <span>EDC</span>
          </div>
        </div>
      </section>
    );
  }

  if (resultado.ganador) {
    return (
      <section
        className={`ruleta ruleta--resultado ruleta--ganador ${compacto ? "ruleta--compacta" : ""}`}
        aria-live="assertive"
        aria-busy="false"
      >
        <span className="ruleta__icono" aria-hidden="true">
          ✓
        </span>
        <div>
          <span className="ruleta__antetitulo">Resultado confirmado</span>
          <h1 className="ruleta__titulo">¡Ganaste!</h1>
          <p className="ruleta__texto ruleta__texto--fuerte">
            Acércate ahora a la mesa de premiación y muestra esta pantalla.
          </p>
        </div>

        <div className="ruleta__folio">
          <span>Número de ganador</span>
          <strong>
            {resultado.pruebas
              ? "PRUEBA"
              : resultado.numeroGanador
                ? `#${String(resultado.numeroGanador).padStart(3, "0")}`
                : "REVISAR"}
          </strong>
        </div>

        {resultado.pruebas ? (
          <p className="ruleta__aviso-prueba">
            Ensayo: no descuenta stock ni permite retirar un premio.
          </p>
        ) : (
          <p className="ruleta__texto">
            También enviamos un respaldo a <strong>{resultado.email}</strong>.
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      className={`ruleta ruleta--resultado ${compacto ? "ruleta--compacta" : ""}`}
      aria-live="polite"
      aria-busy="false"
    >
      <span className="ruleta__icono ruleta__icono--neutro" aria-hidden="true">
        ·
      </span>
      <div>
        <span className="ruleta__antetitulo">Resultado confirmado</span>
        <h1 className="ruleta__titulo">Esta vez no ganaste</h1>
        <p className="ruleta__texto ruleta__texto--fuerte">
          Gracias por participar. Puedes volver a intentarlo mañana.
        </p>
      </div>

      {resultado.pruebas && (
        <p className="ruleta__aviso-prueba">
          Ensayo: esta inscripción no participa del stock real.
        </p>
      )}
    </section>
  );
}
