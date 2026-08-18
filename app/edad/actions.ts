"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EDAD, EDAD_MAX_AGE, destinoSeguro } from "@/lib/edad";

/**
 * Registra la declaración de mayoría de edad en una cookie httpOnly. Al vivir
 * en el servidor queda fuera del alcance del cliente y proxy.ts la verifica en
 * cada petición a las rutas de la promo.
 */
export async function confirmarEdad(formData: FormData) {
  const destino = destinoSeguro(formData.get("next")?.toString());
  const jar = await cookies();
  jar.set({
    name: COOKIE_EDAD,
    value: "1",
    path: "/",
    maxAge: EDAD_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  redirect(destino);
}
