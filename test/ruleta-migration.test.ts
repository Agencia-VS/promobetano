import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const SQL = readFileSync(
  new URL(
    "../supabase/migrations/20260820234500_ruleta_configuracion_pruebas.sql",
    import.meta.url,
  ),
  "utf8",
);

function entre(desde: string, hasta: string): string {
  const inicio = SQL.indexOf(desde);
  const fin = SQL.indexOf(hasta, inicio + desde.length);
  assert.notEqual(inicio, -1, `no aparece ${desde}`);
  assert.notEqual(fin, -1, `no aparece ${hasta}`);
  return SQL.slice(inicio, fin);
}

test("el resolver de pruebas no alcanza stock ni configuración real", () => {
  const resolver = entre(
    "create or replace function public.resolver_ruleta_prueba(",
    "create or replace function public.estado_ruleta_pruebas_admin()",
  );

  assert.match(resolver, /public\.ruleta_prueba_configuracion/);
  assert.match(resolver, /public\.ruleta_prueba_bloques/);
  assert.match(resolver, /ruleta_numero_prueba/);
  assert.doesNotMatch(resolver, /public\.ruleta_configuracion\b/);
  assert.doesNotMatch(resolver, /public\.ruleta_n_automatico\b/);
  assert.doesNotMatch(resolver, /public\.ruleta_global\b/);
  assert.doesNotMatch(resolver, /public\.ruleta_bloques\b/);
  assert.doesNotMatch(resolver, /public\.sorteo_resultados\b/);
});

test("solo el administrador puede leer o cambiar la configuración de prueba", () => {
  assert.match(
    SQL,
    /revoke all on public\.ruleta_prueba_configuracion from public, anon, authenticated/,
  );
  assert.match(
    SQL,
    /grant execute on function public\.estado_ruleta_pruebas_admin\(\)\s+to authenticated/,
  );
  assert.match(
    SQL,
    /grant execute on function public\.configurar_ruleta_pruebas\([\s\S]*?\) to authenticated/,
  );
  assert.doesNotMatch(
    SQL,
    /grant execute on function public\.configurar_ruleta_pruebas\([\s\S]*?\) to anon/,
  );
});
