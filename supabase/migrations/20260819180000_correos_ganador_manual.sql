-- ═══════════════════════════════════════════════════════════════════════════
-- Solo dos correos: confirmación automática y ganador a mano.
--
-- Decisión del 19 ago 2026: desaparecen los correos de suplente y de promovido,
-- y el de ganador deja de salir solo al ejecutar el sorteo. Lo encola el equipo
-- a mano desde el panel, jornada por jornada, cuando toque avisar. La cola y el
-- cron quedan igual: lo que cambia es QUIÉN mete la fila y con qué tipo.
--
-- Tres movimientos:
--
--   1. ejecutar_sorteo y promover_suplente ya no encolan nada. La mecánica del
--      sorteo —pool, resultados, cascada declinado/promovido, auditoría— queda
--      intacta: los suplentes siguen existiendo como DATOS; lo que desaparece
--      es su correo.
--
--   2. encolar_correos_ganadores: el batch manual. Cubre a los ganadores
--      vigentes y a los promovidos —el cupo ya es de ellos, reciben la misma
--      pieza de ganador—. La restricción única de la cola hace que re-tirarlo
--      no le repita el correo a nadie, y ese es justo el camino por el que un
--      promovido nuevo recibe el suyo: se vuelve a tirar el batch de esa
--      jornada y solo él entra a la cola.
--
--   3. El check de la cola se estrecha a los dos tipos vivos. Se borran antes
--      las filas con tipos muertos, o el check nuevo no entra. A la fecha de
--      esta migración la activación no ha partido, así que ninguna fila real
--      puede llevar esos tipos: lo que se borra es resto de pruebas.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. ejecutar_sorteo, sin encolar correos
--
-- Misma firma y mismo retorno que la versión de 20260819170000, así que CREATE
-- OR REPLACE conserva el GRANT. Único cambio: ya no inserta en email_outbox.
-- Los correos de ganador los encola encolar_correos_ganadores, a mano.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.ejecutar_sorteo(
  p_sorteo_id bigint,
  p_actor uuid default null,
  p_forzar boolean default false
)
returns table (
  sorteo_id  bigint,
  en_pool    int,
  excluidos  int,
  ganadores  int,
  suplentes  int
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s public.sorteos%rowtype;
  v_pool int;
  v_exc  int;
  v_gan  int;
  v_sup  int;
  v_previa text;
begin
  -- Reclamo atómico. Si otra transacción ya lo tomó, o el sorteo no está en
  -- borrador, acá se termina. `estado` no es columna de clave, así que este
  -- UPDATE toma FOR NO KEY UPDATE y no choca con los FOR KEY SHARE que cada alta
  -- toma sobre esta misma fila por la clave ajena.
  update public.sorteos
  set estado = 'ejecutando'
  where id = p_sorteo_id and estado = 'borrador'
  returning * into s;

  if not found then
    raise exception 'El sorteo % no está en borrador (ya se ejecutó, se está ejecutando o no existe).', p_sorteo_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Las excepciones de acá abajo abortan la función entera, así que el reclamo se
  -- revierte y el sorteo vuelve a 'borrador'. Parece un estado colgado y no lo es.

  if s.criterio = 'jornada' and not coalesce(p_forzar, false)
     and now() < s.ventana_hasta then
    raise exception
      'La jornada "%" cierra a las % y todavía no son. Ejecutar antes deja fuera a quien está en plazo; si hay que cortar de todas formas, usa p_forzar y quedará registrado.',
      s.nombre, s.ventana_hasta
      using errcode = 'invalid_parameter_value';
  end if;

  if s.excluir_premiados and s.criterio = 'jornada' then
    select sp.nombre into v_previa
    from public.sorteos sp
    where sp.criterio = 'jornada'
      and sp.estado = 'borrador'
      and sp.ventana_desde < s.ventana_desde
    order by sp.ventana_desde
    limit 1;

    if v_previa is not null and not coalesce(p_forzar, false) then
      raise exception
        'La jornada "%" todavía no se ha ejecutado. Con un premio por persona, el reparto de este sorteo depende de quién ganó antes: ejecútalas en orden.',
        v_previa
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- ── Complemento congelado ─────────────────────────────────────────────────
  -- El CASE sobre el criterio impide usar el índice, y es deliberado: esta
  -- consulta corre tres veces en toda la activación, y tener UN predicado del
  -- ámbito en vez de dos copias vale más que el scan.
  insert into public.sorteo_excluidos (sorteo_id, inscripcion_id, motivo)
  select s.id, i.id,
         case when not i.elegible                       then 'inelegible'
              when i.email_estado in ('rebote','queja')  then 'email_invalido'
              else 'ya_premiado' end
  from public.inscripciones i
  where (case when s.criterio = 'jornada'
              then i.sorteo_id = s.id
              else (s.ventana_desde is null or i.creado_at >= s.ventana_desde)
               and (s.ventana_hasta is null or i.creado_at <  s.ventana_hasta)
         end)
    and (
      not i.elegible
      or i.email_estado in ('rebote','queja')
      or (s.excluir_premiados and exists (
            -- Se cruza por RUT y no por correo: el RUT es la identidad con la que
            -- se entrega el premio. Cruzar también por correo excluiría a quien
            -- compartió la dirección con un familiar que ganó.
            select 1
            from public.inscripciones otra
            join public.sorteo_resultados r on r.inscripcion_id = otra.id
            where otra.documento_norm = i.documento_norm
              and r.sorteo_id <> s.id
              and r.rol in ('ganador','promovido')
          ))
    )
  on conflict do nothing;

  get diagnostics v_exc = row_count;

  -- ── Pool congelado ────────────────────────────────────────────────────────
  -- Regla dura 10: el orden lo decide md5(semilla || id) con desempate por id.
  -- Prohibido setseed() + random(), que deja de ser determinista en cuanto el
  -- planificador paraleliza el scan.
  insert into public.sorteo_pool (sorteo_id, inscripcion_id, orden)
  select s.id,
         i.id,
         row_number() over (order by md5(s.semilla || i.id::text), i.id)
  from public.inscripciones i
  where (case when s.criterio = 'jornada'
              then i.sorteo_id = s.id
              else (s.ventana_desde is null or i.creado_at >= s.ventana_desde)
               and (s.ventana_hasta is null or i.creado_at <  s.ventana_hasta)
         end)
    and not exists (
      select 1 from public.sorteo_excluidos e
      where e.sorteo_id = s.id and e.inscripcion_id = i.id
    );

  get diagnostics v_pool = row_count;

  if v_pool = 0 then
    raise exception 'El sorteo % no tiene participantes elegibles en su ámbito.', p_sorteo_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Si el pool es más chico que ganadores + suplentes, se reparte lo que hay: un
  -- pool corto es un dato del negocio, no un error del programa.
  insert into public.sorteo_resultados (sorteo_id, inscripcion_id, posicion, rol)
  select p.sorteo_id, p.inscripcion_id, p.orden,
         case when p.orden <= s.n_ganadores then 'ganador' else 'suplente' end
  from public.sorteo_pool p
  where p.sorteo_id = s.id
    and p.orden <= s.n_ganadores + s.n_suplentes;

  select count(*) filter (where rol = 'ganador'),
         count(*) filter (where rol = 'suplente')
  into v_gan, v_sup
  from public.sorteo_resultados
  where sorteo_resultados.sorteo_id = s.id;

  -- Los correos NO se encolan acá: el de ganador sale a mano, por jornada, con
  -- encolar_correos_ganadores. Los de suplente ya no existen.

  update public.sorteos
  set estado = 'ejecutado', ejecutado_at = now(), ejecutado_por = p_actor
  where id = s.id;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (s.id, 'ejecutado',
          jsonb_build_object(
            'clave', s.clave,
            'criterio', s.criterio,
            'excluir_premiados', s.excluir_premiados,
            'forzado', coalesce(p_forzar, false),
            'en_pool', v_pool,
            'excluidos', v_exc,
            'ganadores', v_gan,
            'suplentes', v_sup,
            'ventana_desde', s.ventana_desde,
            'ventana_hasta', s.ventana_hasta
          ),
          p_actor);

  return query select s.id, v_pool, v_exc::int, v_gan::int, v_sup::int;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. promover_suplente, sin correo de promovido
--
-- Misma firma, así que CREATE OR REPLACE conserva el GRANT. La cascada de roles
-- —declinado arriba, promovido abajo, auditoría— queda igual; lo único que se
-- va es el encolado. Al promovido le llega la pieza de ganador cuando se vuelve
-- a tirar el batch de la jornada.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.promover_suplente(
  p_resultado_id bigint,
  p_motivo text default null,
  p_actor uuid default null
)
returns table (
  declinado_id bigint,
  promovido_id bigint
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  g  public.sorteo_resultados%rowtype;
  su public.sorteo_resultados%rowtype;
  v_excluir boolean;
begin
  select * into g
  from public.sorteo_resultados
  where id = p_resultado_id
  for update;

  if not found then
    raise exception 'No existe el resultado %.', p_resultado_id
      using errcode = 'invalid_parameter_value';
  end if;

  if g.rol <> 'ganador' then
    raise exception 'El resultado % no es un ganador vigente (rol actual: %).', p_resultado_id, g.rol
      using errcode = 'invalid_parameter_value';
  end if;

  select excluir_premiados into v_excluir
  from public.sorteos where id = g.sorteo_id;

  -- Sin el `for update skip locked`, dos promociones simultáneas ascendían al
  -- MISMO suplente y dejaban un premio sin dueño.
  select * into su
  from public.sorteo_resultados r
  where r.sorteo_id = g.sorteo_id
    and r.rol = 'suplente'
    and (
      not v_excluir
      or not exists (
        select 1
        from public.inscripciones mia
        join public.inscripciones otra on otra.documento_norm = mia.documento_norm
        join public.sorteo_resultados pr on pr.inscripcion_id = otra.id
        where mia.id = r.inscripcion_id
          and pr.sorteo_id <> r.sorteo_id
          and pr.rol in ('ganador','promovido')
      )
    )
  order by r.posicion
  limit 1
  for update skip locked;

  if not found then
    raise exception 'El sorteo % no tiene suplentes disponibles%.', g.sorteo_id,
      case when v_excluir then ' que no tengan ya premio en otra jornada' else '' end
      using errcode = 'invalid_parameter_value';
  end if;

  update public.sorteo_resultados
  set rol = 'declinado', motivo = p_motivo, cambiado_at = now()
  where id = g.id;

  update public.sorteo_resultados
  set rol = 'promovido', promovido_desde = g.id, cambiado_at = now()
  where id = su.id;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (g.sorteo_id, 'promocion',
          jsonb_build_object(
            'declinado_resultado', g.id,
            'declinado_posicion', g.posicion,
            'promovido_resultado', su.id,
            'promovido_posicion', su.posicion,
            'excluyo_premiados', v_excluir,
            'motivo', p_motivo
          ),
          p_actor);

  return query select g.id, su.id;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. encolar_correos_ganadores: el batch manual por jornada
--
-- Encola el correo de ganador de todos los que tienen el cupo vigente en este
-- sorteo: rol 'ganador' y también 'promovido', que es un ganador que llegó por
-- la cascada. Los declinados ya no son ganadores, así que quedan fuera solos.
--
-- Idempotente por construcción: el índice único (inscripcion_id, tipo) de la
-- cola convierte un segundo disparo en un no-op para quien ya tiene el correo
-- encolado o enviado, así que el botón del panel se puede apretar sin miedo
-- después de una promoción: entra solo el promovido nuevo.
--
-- Devuelve cuántas filas entraron a la cola, para que el panel pueda decirlo.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.encolar_correos_ganadores(
  p_sorteo_id bigint,
  p_actor uuid default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s           public.sorteos%rowtype;
  v_vigentes  int;
  v_encolados int;
begin
  select * into s
  from public.sorteos
  where id = p_sorteo_id;

  if not found then
    raise exception 'No existe el sorteo %.', p_sorteo_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Solo después de ejecutado: encolar sobre un borrador mandaría el correo a
  -- una lista de ganadores que todavía no existe.
  if s.estado <> 'ejecutado' then
    raise exception
      'El sorteo % está en estado "%": los correos de ganador se encolan solo después de ejecutarlo.',
      p_sorteo_id, s.estado
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.email_outbox (inscripcion_id, tipo)
  select r.inscripcion_id, 'ganador'
  from public.sorteo_resultados r
  where r.sorteo_id = s.id
    and r.rol in ('ganador','promovido')
  on conflict on constraint email_outbox_unico do nothing;

  get diagnostics v_encolados = row_count;

  select count(*) into v_vigentes
  from public.sorteo_resultados r
  where r.sorteo_id = s.id
    and r.rol in ('ganador','promovido');

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (s.id, 'correos_ganadores',
          jsonb_build_object(
            'clave', s.clave,
            'vigentes', v_vigentes,
            'encolados', v_encolados
          ),
          p_actor);

  return v_encolados;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. La cola se estrecha a los dos tipos vivos
--
-- El check original admite los cuatro. Primero se barren las filas con tipos
-- muertos —con la activación sin partir solo puede haber filas de prueba— y
-- después se reemplaza la restricción; al revés, el ADD CONSTRAINT fallaría
-- sobre cualquier fila que quedara.
-- ───────────────────────────────────────────────────────────────────────────

delete from public.email_outbox
where tipo in ('suplente','promovido');

alter table public.email_outbox
  drop constraint email_outbox_tipo_check;

alter table public.email_outbox
  add constraint email_outbox_tipo_check
  check (tipo in ('confirmacion','ganador'));


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Permisos
--
-- Los dos CREATE OR REPLACE conservan los grants que ya tenían. La función
-- nueva sigue la regla de la casa: se revoca todo y se concede solo al rol del
-- panel. El drenaje corre con service role, que salta RLS y no necesita grant.
-- ───────────────────────────────────────────────────────────────────────────

revoke execute on function public.encolar_correos_ganadores(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.encolar_correos_ganadores(bigint, uuid)
  to authenticated;

-- PostgREST cachea las firmas; con dos reemplazos y una función nueva, conviene
-- forzar la recarga.
notify pgrst, 'reload schema';
