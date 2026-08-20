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
| `…20260819100000_configuracion.sql` | Interruptor manual, `listar_sorteos`, `listar_resultados`, `crear_sorteo` |
| `…20260819150000_tomado_at.sql` | `email_outbox.tomado_at`: corrige un correo duplicado bajo acumulación |
| `…20260819170000_jornadas.sql` | **Jornadas**: `inscripciones.sorteo_id`, unicidad por jornada, pool por jornada, exclusión de premiados |

## Aplicar

```bash
supabase link --project-ref <ref>
supabase db push
```

O pegando cada archivo en el editor SQL, en orden.

## Tres sorteos diarios

Respondidas las decisiones 02 y 03, el modelo quedó cargado en la última
migración: **tres jornadas**, una por día, cada una sorteando a las 21:00 de
Santiago, con **30 ganadores y 10 suplentes** cada una.

Una jornada es una fila de `sorteos` con `criterio = 'jornada'` y su ventana. La
diferencia con el modelo anterior es que las inscripciones **apuntan** a su
jornada:

```
inscripciones.sorteo_id  →  sorteos.id
```

Lo escribe un trigger `before insert` contra la ventana que contiene el
`creado_at`, no la aplicación: la regla vale también para un INSERT desde el
editor SQL, y de paso no queda ni una conversión de huso en todo el esquema. De
ahí salen las tres reglas del concurso, sin código que recordarlas:

| Regla | Cómo se impone |
| --- | --- |
| Entra solo al sorteo de su día | El pool es `i.sorteo_id = s.id` |
| Una inscripción por persona y por día | `unique (documento_norm, sorteo_id)` y `unique (email_norm, sorteo_id)` |
| Un premio por persona en toda la activación | `sorteos.excluir_premiados`, que aparta del pool y de la promoción a quien ya tiene premio |

Las tres filas **se siembran en la migración** porque `sorteo_id` es `not null`:
sin jornada cargada la base rechaza toda inscripción, y olvidarse dejaría el QR
vivo en el mall con el 100% de las altas fallando. Para moverlas después no se
edita SQL: se cambia `CONCURSO_SORTEOS` en Vercel y se aprieta **Sincronizar
jornadas** en `/admin`, que llama a `cargar_jornadas`. Es idempotente, exige que
las ventanas sean contiguas y **se niega a tocar una jornada ya ejecutada**.

Los sorteos ad-hoc del panel siguen funcionando igual: se crean con
`criterio = 'ventana'` y su pool se sigue resolviendo por `creado_at`.

La semilla se registra **antes** de ejecutar y no se vuelve a tocar: con ella y
el pool congelado, cualquiera reproduce el resultado. Hay dos verificaciones y
comprueban cosas distintas:

- `verificar_sorteo(id)` — que el **orden** del pool sale de la semilla.
- `verificar_membresia(id)` — que **no quedó nadie** del ámbito sin estar en el
  pool ni en `sorteo_excluidos` con su motivo. Es la que contesta «mi clienta se
  inscribió el sábado, ¿por qué no está en el pool?», que antes era
  incontestable: `elegible` y `email_estado` son mutables, así que reconstruir la
  pertenencia desde el estado actual daba una respuesta distinta cada día.

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

La migración de jornadas se verificó igual, contra PostgreSQL 16 con los roles de
Supabase reproducidos —incluido su `ALTER DEFAULT PRIVILEGES`, que es el que
concede EXECUTE a `anon` sobre cada función nueva—:

- Las diez migraciones aplican en orden y siembran las tres jornadas.
- Fuera de toda ventana el alta responde `sin_jornada`; dentro, la inscripción
  queda en la jornada vigente.
- El mismo RUT entra una vez por jornada y no dos en la misma; el duplicado
  distingue RUT de correo **dentro** de la jornada.
- Una baja por fraude no caduca al día siguiente: devuelve `vetado`.
- El trigger **pisa** el `sorteo_id` que sugiera quien inserte.
- No se puede sortear con la ventana abierta, ni fuera de orden, ni dos veces.
- Quien ganó la jornada 1 queda fuera del pool de la 2, con
  `motivo = 'ya_premiado'` congelado, y tampoco puede ser promovido.
- `verificar_sorteo` y `verificar_membresia` dan `true` en las tres jornadas y
  `premiados_duplicados()` viene vacío.
- Con USAGE en el esquema, como en Supabase, `anon` sigue sin alcanzar ninguna
  función ni tabla del panel; `authenticated` alcanza todo lo que el panel usa.
