"use client";

import { useState } from "react";

const TIPOS = [
  { valor: "ganador", nombre: "Ganador con folio #001" },
] as const;

/**
 * Envío de correos de prueba.
 *
 * Una plantilla de correo no se puede dar por buena mirándola en el navegador:
 * Gmail descarta el `<style>` del cuerpo, Outlook ignora las media queries y cada
 * cliente recolorea el modo oscuro a su gusto. La única prueba que vale es abrir
 * el correo donde lo va a abrir la gente.
 *
 * No toca la base: no crea inscripciones ni encola nada, así que probar cien
 * veces no ensucia la ruleta ni gasta un folio real.
 */
export function PruebaCorreo() {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<string>("ganador");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);
    setExito(null);

    try {
      const r = await fetch("/api/admin/pruebas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, nombre, tipo }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        // El detalle es lo útil acá: «falta RESEND_FROM» o el mensaje del
        // proveedor. Un «no se pudo enviar» a secas obligaría a abrir los logs.
        throw new Error(cuerpo?.detalle || cuerpo?.error || "No se pudo enviar.");
      }
      const cual = TIPOS.find((t) => t.valor === tipo)?.nombre ?? tipo;
      setExito(
        `«${cual}» enviado a ${email}.` +
          (cuerpo?.sorteo ? ` Dice: ${cuerpo.sorteo}.` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
    setEnviando(false);
  };

  return (
    <div className="tarjeta">
      <h2 className="tarjeta__titulo">Correos de prueba</h2>

      <form onSubmit={enviar} className="fila-campos">
        <label className="campo" style={{ minWidth: 220 }}>
          <span>Enviar a</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.cl"
            aria-invalid={error ? true : undefined}
            required
          />
        </label>

        <label className="campo">
          <span>Qué correo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span>Nombre del saludo</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ana Pérez"
            autoCapitalize="words"
          />
        </label>

        <button type="submit" className="btn btn--primario" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar prueba"}
        </button>
      </form>

      {error && (
        <p role="alert" className="aviso aviso--error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      {exito && (
        <p role="status" className="aviso aviso--ok" style={{ marginTop: 12 }}>
          {exito} El asunto va con <code>[PRUEBA]</code> delante para que no se
          confunda con uno real.
        </p>
      )}

      <p className="vacio" style={{ marginTop: 12 }}>
        Revísalo en Gmail y en Outlook, y en modo claro y oscuro: es donde las
        plantillas se rompen. No se guarda nada en la base ni se encola ningún
        envío.
      </p>
    </div>
  );
}
