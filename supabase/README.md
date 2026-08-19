# Esquema de Supabase — Eau de Confianza

Migraciones en orden. Cada archivo es idempotente en lo que puede serlo
(`create table if not exists`, `create or replace function`), pero el orden
importa: la tabla `inscripciones` usa las funciones de normalización del primer
archivo en columnas generadas.

| Archivo | Qué trae |
| --- | --- |
| `…120000_extensiones_y_normalizacion.sql` | `pg_trgm`, `unaccent`, envoltorio inmutable, `rut_norm`, `rut_dv`, `rut_valido`, `email_norm` |
| `…120100_inscripciones.sql` | Tabla, columnas generadas, constraints e índices |
| `…120200_email_outbox.sql` | Cola de correo, toma de lote con `for update skip locked`, backoff, webhook de rebotes |
| `…120300_sorteos.sql` | `sorteos`, `sorteo_pool`, `sorteo_resultados`, auditoría append-only |
| `…120400_ejecutar_sorteo.sql` | `ejecutar_sorteo`, `verificar_sorteo`, `promover_suplente` |
| `…120500_rpc.sql` | `crear_inscripcion`, `listar_inscripciones`, resúmenes, baja lógica |
| `…120600_rls.sql` | RLS en todas las tablas y permisos de cada función |

## Aplicar

```bash
supabase link --project-ref <ref>
supabase db push
```

O pegando cada archivo en el editor SQL, en orden.

## El sorteo está parametrizado

Las decisiones 02 y 03 del `AGENTS.md` —¿un sorteo final o sorteos diarios?,
¿cuántos ganadores y suplentes?— siguen abiertas, así que **no** están escritas
en el esquema. Cada sorteo es una fila:

```sql
-- Un sorteo final sobre toda la activación
insert into public.sorteos (nombre, semilla, n_ganadores, n_suplentes)
values ('Sorteo final', encode(gen_random_bytes(24), 'hex'), 10, 20);

-- O uno por jornada
insert into public.sorteos
  (nombre, semilla, ventana_desde, ventana_hasta, n_ganadores, n_suplentes)
values ('Jornada 2026-09-01', encode(gen_random_bytes(24), 'hex'),
        '2026-09-01 00:00-04', '2026-09-02 00:00-04', 1, 3);
```

La semilla se registra **antes** de ejecutar y no se vuelve a tocar: con ella y
el pool congelado, cualquiera reproduce el resultado. `verificar_sorteo(id)`
hace exactamente eso y devuelve `false` si algo no cuadra.

## Verificación

El esquema se probó contra PostgreSQL 16 antes de entregarlo:

- `rut_norm` y `rut_valido` se compararon con `lib/rut.ts` sobre 1.821 casos
  (adversarios y generados): cero discrepancias. Si divergieran, la
  deduplicación fallaría en silencio y la misma persona entraría dos veces.
- Alta, duplicado por RUT, duplicado por correo, RUT inválido y falta de
  consentimiento devuelven cada uno su resultado.
- Cursor keyset: dos páginas consecutivas sin solapamiento, y el límite se topa
  en 200 aunque el cliente pida 10.000.
- Sorteo: ejecutado, `verificar_sorteo` en `true`, segunda ejecución rechazada,
  promoción de suplente con `promovido_desde` y `cambiado_at`, auditoría que no
  se deja actualizar.
- Permisos: `anon` no lee ninguna tabla ni invoca ninguna RPC del panel, y no
  hay una sola función `security definer` sin `search_path` fijo.
