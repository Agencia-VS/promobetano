import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
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

/**
 * Guardia de /admin.
 *
 * Refresca la sesión de Supabase —los tokens expiran y sin refresco el equipo
 * se ve pateado a login a mitad de un sorteo— y bloquea el acceso sin sesión.
 *
 * Esto NO reemplaza la verificación en cada handler de /api/admin (regla dura
 * 1). Un matcher es una lista que hay que acordarse de mantener; la próxima
 * ruta que alguien agregue fuera de este patrón quedaría abierta y el descuido
 * no aparecería en ninguna parte.
 */
async function guardaAdmin(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  const esLogin = pathname === "/admin/login";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Sin Supabase configurado el panel no puede autenticar a nadie, así que se
  // cierra entero en vez de dejar pasar. El login se deja pasar SIEMPRE: es el
  // destino de la redirección, y redirigirlo a sí mismo produce un bucle
  // infinito que el navegador corta con ERR_TOO_MANY_REDIRECTS.
  if (!url || !clave) {
    if (esLogin) return NextResponse.next({ request });
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "sin_configurar" }, { status: 503 })
      : NextResponse.redirect(new URL("/admin/login?error=config", request.url));
  }

  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(aEscribir) {
        for (const { name, value } of aEscribir) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of aEscribir) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser y no getSession: getSession confía en la cookie sin verificar la
  // firma, así que un token fabricado a mano pasaría el filtro.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !esLogin) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
    }
    const destino = new URL("/admin/login", request.url);
    destino.searchParams.set("next", pathname);
    return NextResponse.redirect(destino);
  }

  if (user && esLogin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El panel no lleva puerta 18+ ni atribución de panel de mall: es otra
  // superficie, con otro público y otra regla de acceso.
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    return guardaAdmin(request);
  }

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
  //
  // /api/admin entra aunque cada handler verifique la sesión por su cuenta: el
  // matcher es la primera barrera y la verificación del handler la segunda,
  // porque ninguna de las dos debería ser el único punto de fallo.
  matcher: ["/", "/i", "/inscripcion", "/listo", "/admin/:path*", "/api/admin/:path*"],
};
