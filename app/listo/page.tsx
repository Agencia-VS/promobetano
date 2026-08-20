"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/Screen";
import { Footer18 } from "@/components/Footer18";
import { Lockup } from "@/components/Lockup";
import { ResultadoRuleta } from "@/components/ResultadoRuleta";
import { leeConfirmadoAhora, useConfirmado } from "@/lib/confirmado";

export default function ListoPage() {
  const router = useRouter();
  // El snapshot del servidor es null para evitar hydration mismatch; después
  // de hidratar aparece la decisión persistida en sessionStorage.
  const resultado = useConfirmado();

  useEffect(() => {
    // Una URL compartida nunca puede fabricar una pantalla de ganador.
    if (leeConfirmadoAhora() === null) router.replace("/i");
  }, [router]);

  return (
    <Screen
      variant="listo"
      padTop={54}
      padX={26}
      poster={
        <Lockup
          width="clamp(230px, 24vw, 320px)"
          sizes="(min-width: 768px) 320px, 230px"
          priority
          className="centrado-movil"
          style={{ display: "block" }}
        />
      }
      accion={
        resultado ? (
          <ResultadoRuleta resultado={resultado} />
        ) : (
          <p style={{ color: "#fff", margin: 0 }}>Preparando tu resultado…</p>
        )
      }
      pie={
        <Footer18>
          Juega con responsabilidad. Solo mayores de 18 años.{" "}
          <Link href="/bases">Bases y condiciones</Link>
        </Footer18>
      }
    />
  );
}
