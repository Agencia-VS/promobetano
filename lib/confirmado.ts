"use client";

import { useCallback, useSyncExternalStore } from "react";
import { safeGetJSON, safeRemove, safeSetJSON } from "./storage.ts";

const KEY = "edc_confirmado";

export type Confirmado = {
  email: string;
  origen: string;
  /** Decisión definitiva tomada por la base al crear la inscripción. */
  ganador: boolean;
  /** Folio global 1..90, o correlativo aislado del ensayo cuando `pruebas`. */
  numeroGanador?: number;
  /**
   * Etiqueta del sorteo al que entró («hoy a las 21:00»), tal como la devolvió
   * el alta. Opcional a propósito: un payload guardado por una versión anterior
   * no la trae, y quien lo tenga en sessionStorage no puede quedar expulsado de
   * /listo por eso.
   */
  sorteo?: string;
  /**
   * El alta fue un ensayo. Opcional por lo mismo que `sorteo`: un payload
   * guardado por una versión anterior no lo trae, y ausente significa «no era
   * una prueba», que es lo correcto para el 100% de las altas reales.
   */
  pruebas?: boolean;
};

const listeners = new Set<() => void>();

/**
 * El snapshot se cachea porque useSyncExternalStore llama getSnapshot en cada
 * render y compara por identidad: devolver un objeto nuevo cada vez causaría
 * un bucle de renders.
 */
let cache: Confirmado | null = null;
let cacheRaw: string | null = null;

function esConfirmado(x: unknown): x is Confirmado {
  if (typeof x !== "object" || x === null) return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.email === "string" &&
    typeof d.origen === "string" &&
    typeof d.ganador === "boolean" &&
    (d.numeroGanador === undefined ||
      (typeof d.numeroGanador === "number" &&
        Number.isInteger(d.numeroGanador) &&
        d.numeroGanador >= 1 &&
        (d.pruebas === true || d.numeroGanador <= 90))) &&
    // `sorteo` es opcional, pero si viene tiene que ser texto: sin este guard un
    // valor raro se interpolaría en JSX y crashearía /listo, que es el defecto
    // que ya ocurrió una vez con `email`.
    (d.sorteo === undefined || typeof d.sorteo === "string") &&
    (d.pruebas === undefined || typeof d.pruebas === "boolean")
  );
}

function leer(): Confirmado | null {
  const parsed = safeGetJSON("session", KEY);
  const raw = parsed === null ? null : JSON.stringify(parsed);
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  // Sin este type guard un valor no-string en `email` se interpolaba en JSX y
  // crasheaba toda la ruta /listo (React error #31), sin error boundary.
  cache = esConfirmado(parsed) ? parsed : null;
  return cache;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** En el servidor no hay sessionStorage: el snapshot es null y ambos lados coinciden. */
const getServerSnapshot = (): Confirmado | null => null;

export function guardaConfirmado(c: Confirmado): void {
  safeSetJSON("session", KEY, c);
  cacheRaw = null;
  for (const l of listeners) l();
}

export function borraConfirmado(): void {
  safeRemove("session", KEY);
  cacheRaw = null;
  for (const l of listeners) l();
}

/**
 * Espeja la confirmación sin provocar hydration mismatch: getServerSnapshot
 * devuelve null tanto en SSR como en el render de hidratación, y React
 * re-renderiza después con el valor real. Leerlo en un inicializador de
 * useState producía un error #418 en el 100% de las conversiones.
 */
export function useConfirmado(): Confirmado | null {
  const getSnapshot = useCallback(() => leer(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Lectura directa, para el guard de /listo. El valor del hook es null durante
 * la hidratación por diseño (getServerSnapshot), así que un guard basado en él
 * redirigiría por error a quien SÍ se inscribió.
 */
export function leeConfirmadoAhora(): Confirmado | null {
  return leer();
}
