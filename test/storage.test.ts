import { strict as assert } from "node:assert";
import { test } from "node:test";
import { safeSet } from "../lib/storage.ts";

function conWindow(valor: object, prueba: () => void) {
  const previo = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: valor,
  });
  try {
    prueba();
  } finally {
    if (previo) Object.defineProperty(globalThis, "window", previo);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("safeSet avisa cuando el navegador bloquea sessionStorage", () => {
  conWindow(
    {
      get sessionStorage() {
        throw new Error("SecurityError");
      },
    },
    () => assert.equal(safeSet("session", "resultado", "ganador"), false),
  );
});

test("safeSet avisa cuando la cuota está llena", () => {
  conWindow(
    {
      sessionStorage: {
        setItem() {
          throw new Error("QuotaExceededError");
        },
      },
    },
    () => assert.equal(safeSet("session", "resultado", "ganador"), false),
  );
});

test("safeSet confirma una escritura efectiva", () => {
  let guardado = "";
  conWindow(
    {
      sessionStorage: {
        setItem(_key: string, value: string) {
          guardado = value;
        },
      },
    },
    () => assert.equal(safeSet("session", "resultado", "ganador"), true),
  );
  assert.equal(guardado, "ganador");
});
