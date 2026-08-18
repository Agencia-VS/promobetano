"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const l of listeners) l();
}

function read(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function setSessionFlag(key: string, value: boolean) {
  try {
    if (value) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch {
    // Almacenamiento no disponible: la puerta simplemente vuelve a
    // preguntar la próxima vez, no es un caso que deba bloquear nada.
  }
  emit();
}

const getServerSnapshot = () => false;

/** Espeja un flag booleano en sessionStorage sin caer en setState-en-efecto. */
export function useSessionFlag(key: string): boolean {
  const getSnapshot = useCallback(() => read(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
