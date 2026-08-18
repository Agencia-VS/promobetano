"use client";

import { useCallback, useSyncExternalStore } from "react";
import { safeGetJSON, safeRemove, safeSetJSON } from "./storage.ts";

const KEY = "edc_confirmado";

export type Confirmado = { email: string; origen: string };

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
  return typeof d.email === "string" && typeof d.origen === "string";
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
