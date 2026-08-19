-- ============================================================================
-- Configuración operativa: el interruptor manual de inscripciones.
--
-- Las fechas en variables de entorno resuelven el caso normal —la ventana se
-- planifica y se cumple sola— pero no el operativo: el panel de un mall se
-- instaló tarde, el cliente pide media hora más, hay que cortar de urgencia
-- porque algo salió mal. Para eso hace falta un interruptor que alguien pueda
-- accionar desde el navegador en segundos, sin tocar Vercel ni esperar un
-- redespliegue.
--
-- El interruptor NO reemplaza al calendario, lo pisa:
--
--   null   → manda el calendario (CONCURSO_INICIO / CONCURSO_CIERRE)
--   true   → abierto, aunque el calendario diga que no
--   false  → cerrado, aunque el calendario diga que sí
--
-- Que el valor por defecto sea null y no `false` importa: si esta tabla se
-- creara vacía en un proyecto nuevo, el sitio seguiría respetando las fechas en
-- vez de quedar mudo hasta que alguien descubra que hay un interruptor.
-- ============================================================================

create table if not exists public.configuracion (
  -- Fila única: la clave primaria es un booleano con CHECK a true, así que la
  -- tabla no puede tener dos filas ni por accidente ni desde el editor SQL.
  id boolean primary key default true check (id),

  inscripciones_abiertas boolean,

  actualizado_at  timestamptz not null default now(),
  actualizado_por uuid
);

insert into public.configuracion (id, inscripciones_abiertas)
values (true, null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Lectura pública
--
-- La portada y el formulario son anónimos y necesitan saber si aceptar
-- inscripciones, así que esta función se concede a anon. No expone nada: un
-- booleano que el propio sitio ya revela al mostrar o esconder el formulario.
-- ----------------------------------------------------------------------------
create or replace function public.estado_inscripciones()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select inscripciones_abiertas from public.configuracion where id
$$;

/**
 * Acciona el interruptor. `p_abiertas` en null devuelve el control al
 * calendario, que es el estado en el que debería quedar el sistema una vez
 * pasada la urgencia que motivó el override.
 */
create or replace function public.set_inscripciones(
  p_abiertas boolean,
  p_actor uuid default null
)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.configuracion
  set inscripciones_abiertas = p_abiertas,
      actualizado_at = now(),
      actualizado_por = p_actor
  where id
  returning inscripciones_abiertas
$$;

alter table public.configuracion enable row level security;
alter table public.configuracion force row level security;
revoke all on public.configuracion from anon, authenticated;

revoke execute on function public.estado_inscripciones() from public;
revoke execute on function public.set_inscripciones(boolean, uuid) from public;

-- Los grants definitivos están en el barrido del final del archivo: acá se
-- concederían antes de que ese barrido los revoque.

-- ----------------------------------------------------------------------------
-- Listado de sorteos para el panel
--
-- Acotado y con los recuentos ya agregados: el panel necesita saber cuántos
-- ganadores y suplentes tiene cada sorteo sin traerse las filas de resultados
-- para contarlas en JavaScript.
-- ----------------------------------------------------------------------------
create or replace function public.listar_sorteos()
returns table (
  id bigint,
  nombre text,
  estado text,
  ventana_desde timestamptz,
  ventana_hasta timestamptz,
  n_ganadores int,
  n_suplentes int,
  creado_at timestamptz,
  ejecutado_at timestamptz,
  en_pool bigint,
  ganadores_vigentes bigint,
  suplentes_vigentes bigint,
  reproduce boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.nombre, s.estado, s.ventana_desde, s.ventana_hasta,
         s.n_ganadores, s.n_suplentes, s.creado_at, s.ejecutado_at,
         (select count(*) from public.sorteo_pool p where p.sorteo_id = s.id),
         (select count(*) from public.sorteo_resultados r
           where r.sorteo_id = s.id and r.rol in ('ganador','promovido')),
         (select count(*) from public.sorteo_resultados r
           where r.sorteo_id = s.id and r.rol = 'suplente'),
         -- Se recalcula el orden desde la semilla en cada consulta del panel:
         -- si algún día deja de reproducir, hay que verlo en la pantalla donde
         -- se publica el resultado, no en una auditoría seis meses después.
         case when s.estado = 'ejecutado'
              then public.verificar_sorteo(s.id) end
  from public.sorteos s
  order by s.id desc
  limit 100
$$;

/** Resultados de un sorteo, con los datos de contacto de cada persona. */
create or replace function public.listar_resultados(p_sorteo_id bigint)
returns table (
  id bigint,
  posicion int,
  rol text,
  nombre text,
  email text,
  telefono text,
  documento text,
  email_estado text,
  motivo text,
  promovido_desde bigint,
  cambiado_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.posicion, r.rol, i.nombre, i.email, i.telefono, i.documento,
         i.email_estado, r.motivo, r.promovido_desde, r.cambiado_at
  from public.sorteo_resultados r
  join public.inscripciones i on i.id = r.inscripcion_id
  where r.sorteo_id = p_sorteo_id
  order by r.posicion
$$;

/**
 * Crea un sorteo en borrador con una semilla aleatoria de 64 hexadecimales.
 *
 * La semilla la genera la base y no el navegador del admin: tiene que quedar
 * registrada antes de ejecutar y no depender de que nadie la copie a mano.
 *
 * Se arma con dos gen_random_uuid() en vez de gen_random_bytes() porque el
 * primero es del núcleo de Postgres y el segundo vive en pgcrypto, que en
 * Supabase está instalado en el esquema `extensions` y no resolvería con el
 * search_path fijo de esta función.
 */
create or replace function public.crear_sorteo(
  p_nombre text,
  p_n_ganadores int,
  p_n_suplentes int,
  p_ventana_desde timestamptz default null,
  p_ventana_hasta timestamptz default null
)
returns bigint
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into public.sorteos
    (nombre, semilla, n_ganadores, n_suplentes, ventana_desde, ventana_hasta)
  values
    (p_nombre,
     replace(gen_random_uuid()::text, '-', '') ||
     replace(gen_random_uuid()::text, '-', ''),
     p_n_ganadores, p_n_suplentes, p_ventana_desde, p_ventana_hasta)
  returning id
$$;

-- ----------------------------------------------------------------------------
-- Permisos: barrido final
--
-- ⚠️ TRAMPA DE SUPABASE. En un PostgreSQL limpio basta `revoke execute ... from
-- public`, porque el único permiso que trae una función nueva es el de PUBLIC.
-- Supabase, en cambio, deja configurado un ALTER DEFAULT PRIVILEGES que concede
-- EXECUTE a anon, authenticated y service_role sobre cada función que se cree
-- en `public`. Ese es un permiso PROPIO de cada rol, y revocárselo a PUBLIC no
-- lo toca.
--
-- Se detectó en producción: `listar_sorteos` respondía 200 a la clave anónima
-- pese a estar concedida solo a `authenticated`. No filtraba datos personales
-- —el listado de sorteos no los tiene— pero sí el nombre, las fechas y los
-- recuentos de cada sorteo, y el mismo descuido sobre `listar_resultados` sí
-- habría expuesto nombres, correos y RUT de los ganadores.
--
-- Por eso se revoca a anon TODO el esquema y después se le devuelven, una por
-- una, las dos funciones que el sitio público necesita. Enumerar lo permitido
-- es la única forma que no se rompe cuando alguien agregue la próxima función.
-- ----------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;

grant execute on function public.crear_inscripcion(
  text, text, text, text, boolean, boolean, boolean, text
) to anon;
grant execute on function public.estado_inscripciones() to anon;

-- Y las del panel, para `authenticated`.
grant execute on function public.listar_sorteos() to authenticated;
grant execute on function public.listar_resultados(bigint) to authenticated;
grant execute on function public.crear_sorteo(text, int, int, timestamptz, timestamptz) to authenticated;
grant execute on function public.set_inscripciones(boolean, uuid) to authenticated;
grant execute on function public.estado_inscripciones() to authenticated;
grant execute on function public.crear_inscripcion(
  text, text, text, text, boolean, boolean, boolean, text
) to authenticated;
grant execute on function public.listar_inscripciones(
  text, text, boolean, timestamptz, bigint, int
) to authenticated;
grant execute on function public.resumen_inscripciones() to authenticated;
grant execute on function public.resumen_por_panel() to authenticated;
grant execute on function public.marcar_inelegible(bigint, text) to authenticated;
grant execute on function public.ejecutar_sorteo(bigint, uuid) to authenticated;
grant execute on function public.promover_suplente(bigint, text, uuid) to authenticated;
grant execute on function public.verificar_sorteo(bigint) to authenticated;
