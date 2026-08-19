-- ============================================================================
-- RPC: alta pública y lecturas del panel.
-- ============================================================================

/**
 * Alta de inscripción. Único camino público de escritura.
 *
 * Es una RPC `security definer` y no un INSERT con política abierta para anon
 * porque así la validación, el encolado del correo y el manejo del duplicado
 * ocurren en una sola transacción y en un solo lugar. Un `for insert to anon
 * with check (true)` deja a cualquiera con la clave pública escribiendo filas
 * arbitrarias en la tabla.
 *
 * NO usa el service role: la regla dura 2 lo reserva para después de una
 * verificación de sesión, y esta ruta es anónima por definición.
 *
 * El duplicado se devuelve como resultado, no como excepción: inscribirse dos
 * veces es un caso normal —la persona vuelve a escanear el QR— y merece un
 * mensaje, no un error 500.
 */
create or replace function public.crear_inscripcion(
  p_nombre text,
  p_email text,
  p_telefono text,
  p_documento text,
  p_declara_edad boolean,
  p_acepta_bases boolean,
  p_acepta_marketing boolean default false,
  p_origen text default 'directo'
)
returns table (
  resultado text,
  inscripcion_id bigint
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  -- El cliente ya valida, pero el cliente es evadible (regla dura 3). Estos
  -- chequeos son los mismos que impone la tabla; se anticipan para devolver un
  -- motivo legible en vez de un error de constraint.
  if not (p_declara_edad and p_acepta_bases) then
    return query select 'falta_consentimiento'::text, null::bigint;
    return;
  end if;

  if not public.rut_valido(p_documento) then
    return query select 'rut_invalido'::text, null::bigint;
    return;
  end if;

  begin
    insert into public.inscripciones (
      nombre, email, telefono, documento,
      declara_edad, acepta_bases, acepta_marketing, origen
    )
    values (
      btrim(p_nombre), btrim(p_email), p_telefono, btrim(p_documento),
      p_declara_edad, p_acepta_bases, coalesce(p_acepta_marketing, false),
      coalesce(p_origen, 'directo')
    )
    returning id into v_id;
  exception
    when unique_violation then
      -- Se distingue cuál de las dos claves chocó para poder decirle a la
      -- persona qué dato ya está registrado.
      if exists (
        select 1 from public.inscripciones
        where documento_norm = public.rut_norm(p_documento)
      ) then
        return query select 'duplicado_rut'::text, null::bigint;
      else
        return query select 'duplicado_email'::text, null::bigint;
      end if;
      return;
    when check_violation then
      return query select 'datos_invalidos'::text, null::bigint;
      return;
  end;

  -- Encolar, no enviar (regla dura 8).
  insert into public.email_outbox (inscripcion_id, tipo)
  values (v_id, 'confirmacion')
  on conflict on constraint email_outbox_unico do nothing;

  return query select 'creada'::text, v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Listado del panel: cursor keyset
--
-- Nunca `select` sin paginar y nunca OFFSET (regla dura 6). Con 200.000 filas,
-- `OFFSET 190000` hace que Postgres lea y descarte 190.000 filas en cada
-- página: la última página del panel tarda cientos de veces más que la
-- primera. El cursor keyset `(creado_at, id) < (cursor)` usa el índice y
-- cuesta lo mismo en la página 1 que en la 4.000.
--
-- El cursor es la última fila devuelta. El orden es exactamente el del índice
-- inscripciones_orden_idx; si se cambia uno hay que cambiar el otro.
-- ----------------------------------------------------------------------------
create or replace function public.listar_inscripciones(
  p_buscar text default null,
  p_origen text default null,
  p_solo_elegibles boolean default null,
  p_cursor_creado_at timestamptz default null,
  p_cursor_id bigint default null,
  p_limite int default 50
)
returns table (
  id bigint,
  creado_at timestamptz,
  nombre text,
  email text,
  telefono text,
  documento text,
  origen text,
  elegible boolean,
  email_estado text,
  acepta_marketing boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.creado_at, i.nombre, i.email, i.telefono, i.documento,
         i.origen, i.elegible, i.email_estado, i.acepta_marketing
  from public.inscripciones i
  where
    -- El % y el _ del término se escapan: sin eso, buscar "100%" devuelve la
    -- tabla entera y el índice no sirve de nada.
    (p_buscar is null or btrim(p_buscar) = '' or i.busqueda like
      '%' || replace(replace(replace(
        public.inmutable_unaccent(lower(btrim(p_buscar))),
        '\', '\\'), '%', '\%'), '_', '\_') || '%')
    and (p_origen is null or i.origen = p_origen)
    and (p_solo_elegibles is null or i.elegible = p_solo_elegibles)
    and (p_cursor_creado_at is null or p_cursor_id is null
         or (i.creado_at, i.id) < (p_cursor_creado_at, p_cursor_id))
  order by i.creado_at desc, i.id desc
  -- Techo duro: ningún parámetro del cliente puede pedir la tabla entera.
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

/** Recuentos del panel. Agrega en Postgres; traer las filas para contarlas en
    JavaScript es exactamente lo que no escala a 200.000 registros. */
create or replace function public.resumen_inscripciones()
returns table (
  total bigint,
  elegibles bigint,
  con_marketing bigint,
  rebotes bigint,
  quejas bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*),
         count(*) filter (where elegible),
         count(*) filter (where acepta_marketing),
         count(*) filter (where email_estado = 'rebote'),
         count(*) filter (where email_estado = 'queja')
  from public.inscripciones
$$;

/** Reporte por panel de mall: responde para qué existe el ?p= del QR. */
create or replace function public.resumen_por_panel()
returns table (origen text, total bigint, elegibles bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.origen, count(*), count(*) filter (where i.elegible)
  from public.inscripciones i
  group by i.origen
  order by count(*) desc
$$;

/**
 * Baja lógica. Nunca DELETE sobre inscripciones (regla dura 4): un registro
 * borrado no puede responder "quién participaba" en una fiscalización.
 */
create or replace function public.marcar_inelegible(
  p_id bigint,
  p_motivo text
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.inscripciones
  set elegible = false, motivo_inelegible = p_motivo
  where id = p_id
$$;
