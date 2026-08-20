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
| `…20260819180000_correos_ganador_manual.sql` | Solo dos correos: confirmación automática y ganador a mano |
| `…20260820120000_pruebas.sql` | **Modo pruebas**: jornada de ensayo, identidades sin límite, aislamiento del sorteo real y borrado de lo que deje |

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

## Pruebas en producción

Antes de que abra el concurso no se puede probar nada contra la base real: el
calendario dice «antes», y aunque se abriera el interruptor manual ninguna
jornada cubre el instante, así que el alta muere en `sin_jornada` —`sorteo_id`
es `not null` y lo resuelve un trigger contra las ventanas cargadas—.

La tarjeta **Pruebas en producción** de `/admin` resuelve las tres cosas de un
clic:

| Botón | RPC | Qué hace |
| --- | --- | --- |
| Abrir pruebas | `abrir_pruebas` | Crea la jornada de ensayo `clave = 'prueba'` con ventana `[ahora, comienzo de la próxima jornada real)`, abre el interruptor y enciende `configuracion.modo_pruebas`. **Se niega si hay una jornada real corriendo** |
| Cerrar pruebas | `cerrar_pruebas` | Devuelve el interruptor al calendario y cierra la ventana del ensayo. No borra nada |
| Borrar datos de prueba | `purgar_pruebas` | Borra en cascada la cola, resultados, pool, excluidos, inscripciones, auditoría y el sorteo de ensayo |

Las garantías, todas impuestas por el esquema y no por la aplicación:

- **Aislamiento.** `ejecutar_sorteo` aparta del pool de todo sorteo REAL las
  filas con `es_prueba`, con `motivo = 'prueba'` congelado en
  `sorteo_excluidos`. Un premio de ensayo tampoco excluye a nadie de un sorteo
  real ni aparece en `premiados_duplicados()`.
- **La ventana se cierra sola.** Termina exactamente donde empieza la primera
  jornada real, así que olvidarse de apagar el modo no mete ni una inscripción
  real en la jornada de ensayo. Una jornada de prueba en borrador tampoco
  bloquea el orden de ejecución de las reales.
- **Sin límite para el equipo.** Los índices únicos por jornada son parciales
  (`where not identidad_prueba`), así que el RUT y el correo de
  `identidades_prueba` se inscriben las veces que haga falta. Para cualquier
  otro RUT la unicidad sigue igual, y por eso el mensaje de «ya estás inscrito»
  también se puede probar.
- **Las cifras no se ensucian.** `resumen_inscripciones`, `resumen_por_panel`,
  `resumen_jornadas` y `listar_sorteos` cuentan los ensayos aparte, en su propia
  columna. Nunca dentro del total.
- **El público se entera, y solo cuando es verdad.** Con el modo encendido, el
  formulario dice en la misma pantalla que esas inscripciones no entran a ningún
  sorteo y se borran. El aviso NO se pinta si hay una jornada real corriendo:
  `estadoVigente` lo condiciona a que el calendario no tenga jornada en curso,
  así que olvidarse de apagar el modo no le dice a nadie del mall que su
  inscripción no vale. Y `abrir_pruebas` se niega a encenderse durante una
  jornada real: dentro de ella la identidad del equipo ya se inscribe sin límite
  y queda fuera del pool, porque su exención es por identidad y no por ventana.

Las identidades exentas viven en `identidades_prueba` (RUT ya normalizado, sin
puntos ni guión):

```sql
insert into public.identidades_prueba (clase, valor, nota)
values ('email', 'quien@agenciavs.cl', 'Segunda dirección del equipo');
```

### Dos excepciones a reglas duras

`purgar_pruebas` **borra** filas de `inscripciones`, contra la regla 4. Está
acotado en el SQL —solo `es_prueba`, y nunca las que quedaron dentro de un
sorteo real ya ejecutado, cuyo pool y complemento están congelados—; esas se
informan como conservadas en vez de callarse. Y `solo_append` deja borrar la
auditoría de un sorteo marcado como prueba, y solo la de esos: la alternativa
era desactivar el trigger a mano, que desprotege la tabla entera mientras dure.

### Limpiar a mano

No hace falta bajar la RLS de nada, y no conviene: es forzada y sin políticas a
propósito. Desde el editor SQL del dashboard —que corre con privilegios que la
saltan— basta invocar la misma RPC:

```sql
select * from public.purgar_pruebas();
```

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

El modo pruebas se verificó igual, con las doce migraciones aplicadas en orden
sobre PostgreSQL 16 y los roles de Supabase reproducidos:

- Fuera de toda ventana el alta responde `sin_jornada`; con el modo abierto, la
  misma llamada crea la inscripción en la jornada de ensayo.
- El RUT `11.111.111-1` y el correo del equipo se inscriben cuatro veces
  seguidas; un RUT cualquiera choca a la segunda con `duplicado_rut`.
- El ensayo se sortea sin esperar a que cierre su ventana, `verificar_sorteo` y
  `verificar_membresia` dan `true`, y `premiados_duplicados()` viene vacío.
- Una fila de prueba dentro de una jornada REAL queda fuera del pool con motivo
  `prueba` y la membresía sigue completa.
- `cerrar_pruebas` cierra la ventana también cuando el ensayo ya se sorteó, y
  reabrir sin purgar se niega con un mensaje que dice qué hacer.
- Con la jornada del viernes en curso, `abrir_pruebas` se niega; en cambio el
  RUT del equipo se inscribe dos veces seguidas dentro de esa jornada real,
  marcado `es_prueba` y sin aparecer en ninguna cifra.
- La purga deja la base en cero inscripciones y sin sorteos de prueba;
  la auditoría de un sorteo real sigue sin dejarse actualizar ni borrar.
- `anon` no alcanza `abrir_pruebas`, `cerrar_pruebas`, `purgar_pruebas` ni
  `identidades_prueba`; sí `estado_publico`, que es un par de booleanos.
