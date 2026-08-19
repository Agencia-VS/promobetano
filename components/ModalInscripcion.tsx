"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import "@/styles/modal.css";

const FOCALIZABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Envoltorio del modal de inscripción.
 *
 * Cierra con Escape, con el botón × y tocando fuera del panel, y siempre por
 * `router.back()`: como la URL es real, retroceder es literalmente cerrar el
 * modal, y el botón atrás del navegador hace lo mismo que la ×.
 *
 * Implementa lo que a la referencia le faltaba: trampa de foco y devolución del
 * foco al control que lo abrió. Sin trampa, tabular desde el último campo saca
 * el foco al contenido de la portada que sigue montado detrás, y quien navegue
 * con teclado o lector de pantalla se pierde dentro de una página que
 * visualmente ya no está.
 */
export function ModalInscripcion({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const veniaDe = useRef<HTMLElement | null>(null);

  const cerrar = useCallback(() => router.back(), [router]);

  useEffect(() => {
    veniaDe.current = document.activeElement as HTMLElement | null;

    // El fondo no debe scrollear detrás del modal: en un teléfono, arrastrar
    // sobre el formulario movía la portada y daba la sensación de que la
    // pantalla se rompía.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // El primer campo NO se enfoca solo: en móvil eso abre el teclado de golpe
    // y tapa el titular antes de que la persona lea qué se le está pidiendo.
    panel.current?.focus();

    function alTeclado(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        cerrar();
        return;
      }

      if (ev.key !== "Tab" || !panel.current) return;

      const focos = Array.from(
        panel.current.querySelectorAll<HTMLElement>(FOCALIZABLES),
      ).filter((el) => el.offsetParent !== null);
      if (focos.length === 0) return;

      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      const activo = document.activeElement;

      if (ev.shiftKey && (activo === primero || activo === panel.current)) {
        ev.preventDefault();
        ultimo.focus();
      } else if (!ev.shiftKey && activo === ultimo) {
        ev.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alTeclado);
    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = overflowPrevio;
      veniaDe.current?.focus?.();
    };
  }, [cerrar]);

  return (
    <div
      className="modal-fondo"
      // Solo cierra si el clic cayó en el fondo. Sin esta comprobación, soltar
      // el mouse fuera del panel tras seleccionar texto dentro cerraría el
      // formulario a medio llenar.
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) cerrar();
      }}
    >
      <div
        ref={panel}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
        tabIndex={-1}
      >
        <button
          type="button"
          className="modal-cerrar"
          onClick={cerrar}
          aria-label="Cerrar"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
