import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_EDAD, RUTAS_CON_PUERTA } from "@/lib/edad";
import {
  COOKIE_ORIGEN,
  HEADER_ORIGEN,
  ORIGEN_DIRECTO,
  normalizaOrigen,
  slugValido,
} from "@/lib/origen";

/**
 * Resuelve la atribución de panel con la precedencia correcta: el ?p= de la
 * petición actual manda, y la cookie solo cubre las navegaciones siguientes.
 * Antes era al revés (`cookie || url`), así que una cookie de 30 días le
 * ganaba al ?p= vigente y la inscripción se acreditaba al panel equivocado.
 */
function resuelveOrigen(request: NextRequest): string {
  const cookie = request.cookies.get(COOKIE_ORIGEN)?.value;
  const previo = cookie && slugValido(cookie) ? cookie : ORIGEN_DIRECTO;

  if (!request.nextUrl.searchParams.has("p")) return previo;
  const desdeUrl = normalizaOrigen(
    request.nextUrl.searchParams.getAll("p").filter((s) => s.trim() !== ""),
  );
  // Un ?p= presente pero inválido no debe borrar una atribución buena.
  return desdeUrl === ORIGEN_DIRECTO ? previo : desdeUrl;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origen = resuelveOrigen(request);

  const requiereEdad = RUTAS_CON_PUERTA.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  const confirmado = request.cookies.get(COOKIE_EDAD)?.value === "1";

  const response =
    requiereEdad && !confirmado
      ? redirigeAPuerta(request)
      : NextResponse.next({ request: { headers: conOrigen(request, origen) } });

  // La cookie se refresca en la misma respuesta, así que el ?p= del QR queda
  // registrado incluso cuando la puerta 18+ intercepta la primera visita.
  if (origen !== ORIGEN_DIRECTO) {
    response.cookies.set({
      name: COOKIE_ORIGEN,
      value: origen,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

function conOrigen(request: NextRequest, origen: string): Headers {
  const headers = new Headers(request.headers);
  headers.set(HEADER_ORIGEN, origen);
  return headers;
}

function redirigeAPuerta(request: NextRequest) {
  const url = request.nextUrl.clone();
  const destino = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/edad";
  url.search = "";
  url.searchParams.set("next", destino);
  return NextResponse.redirect(url);
}

export const config = {
  // "/" entra para capturar el ?p= de QR impresos contra la raíz del dominio,
  // pero no lleva puerta: redirige a /i, que sí la lleva.
  matcher: ["/", "/i", "/inscripcion", "/listo"],
};
