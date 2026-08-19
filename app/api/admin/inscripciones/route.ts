import { NextResponse } from "next/server";
import { conSesion, errorRpc } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Listado paginado por cursor keyset.
 *
 * Nunca OFFSET (regla dura 6): con 200.000 filas, `OFFSET 190000` obliga a
 * Postgres a leer y descartar 190.000 filas en cada página, y la última tarda
 * cientos de veces más que la primera. El cursor cuesta lo mismo en la página 1
 * que en la 4.000.
 *
 * El cursor es la última fila devuelta, no un número de página.
 */
export const GET = conSesion(async ({ supabase, request }) => {
  const url = new URL(request.url);
  const buscar = url.searchParams.get("buscar");
  const origen = url.searchParams.get("origen");
  const soloElegibles = url.searchParams.get("elegibles");
  const cursorAt = url.searchParams.get("cursor_at");
  const cursorId = url.searchParams.get("cursor_id");

  const { data, error } = await supabase.rpc("listar_inscripciones", {
    p_buscar: buscar || null,
    p_origen: origen || null,
    p_solo_elegibles:
      soloElegibles === "true" ? true : soloElegibles === "false" ? false : null,
    p_cursor_creado_at: cursorAt || null,
    p_cursor_id: cursorId ? Number(cursorId) : null,
    p_limite: 50,
  });

  if (error) return errorRpc(error.message);

  const filas = (data ?? []) as Array<{ id: number; creado_at: string }>;
  const ultima = filas.at(-1);

  return NextResponse.json({
    filas,
    // El cursor viaja resuelto para que el cliente no tenga que saber por qué
    // columnas se ordena.
    cursor: ultima ? { at: ultima.creado_at, id: ultima.id } : null,
    hayMas: filas.length === 50,
  });
});
