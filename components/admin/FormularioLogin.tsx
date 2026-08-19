"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/navegador";

/**
 * Login del panel.
 *
 * Va contra Supabase Auth desde el navegador porque así la sesión queda escrita
 * en las cookies que después leen proxy.ts y cada handler de /api/admin. El
 * usuario se crea a mano una vez desde el panel de Supabase (Authentication →
 * Users): este proyecto no tiene registro público, que está fuera de alcance.
 */
export function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    if (enviando) return;

    const supabase = supabaseNavegador();
    if (!supabase) {
      setError("Faltan las variables de Supabase en el entorno.");
      return;
    }

    setError(null);
    setEnviando(true);

    const { error: err } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });

    if (err) {
      // Mensaje genérico a propósito: distinguir "ese correo no existe" de "la
      // clave está mal" le confirma a quien prueba credenciales cuáles son
      // válidas.
      setError("Correo o clave incorrectos.");
      setEnviando(false);
      return;
    }

    // refresh() antes de push() para que el componente de servidor del panel se
    // vuelva a renderizar con la sesión ya escrita; sin eso el primer render
    // llega sin cookie y rebota a login.
    router.refresh();
    router.push(params.get("next") || "/admin");
  }

  return (
    <form onSubmit={enviar} className="login__caja">
      <label className="campo">
        <span>Correo</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
        />
      </label>

      <label className="campo">
        <span>Clave</span>
        <input
          type="password"
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          required
        />
      </label>

      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn--primario" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
