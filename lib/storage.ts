/**
 * Acceso a Web Storage que nunca lanza. En un mall hay teléfonos con datos de
 * sitio bloqueados, WebViews restringidos y cuotas llenas; ninguna de esas
 * situaciones debe romper el flujo de inscripción.
 */
type Kind = "local" | "session";

function store(kind: Kind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeGet(kind: Kind, key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSet(kind: Kind, key: string, value: string): boolean {
  try {
    const storage = store(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(kind: Kind, key: string): void {
  try {
    store(kind)?.removeItem(key);
  } catch {
    // Nada que hacer: si no se puede borrar, tampoco se pudo escribir.
  }
}

/** Lee y parsea JSON, devolviendo null ante cualquier corrupción. */
export function safeGetJSON(kind: Kind, key: string): unknown {
  const raw = safeGet(kind, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Valor corrupto: se descarta para que no se reproduzca en cada carga.
    safeRemove(kind, key);
    return null;
  }
}

export function safeSetJSON(kind: Kind, key: string, value: unknown): boolean {
  try {
    return safeSet(kind, key, JSON.stringify(value));
  } catch {
    return false;
  }
}
