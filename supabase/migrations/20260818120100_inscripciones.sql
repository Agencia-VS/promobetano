-- ============================================================================
-- Tabla de inscripciones.
--
-- Dimensionada para 10.000 altas diarias. Todo lo que decide identidad o
-- elegibilidad está en la base con índices que lo respalden: filtrar en
-- JavaScript lo que Postgres puede filtrar con un índice es exactamente lo que
-- rompió el panel del concurso anterior.
-- ============================================================================

create table if not exists public.inscripciones (
  id            bigint generated always as identity primary key,
  creado_at     timestamptz not null default now(),

  nombre        text not null,
  email         text not null,
  -- 8 dígitos, los que van después del +56 9. El prefijo es un adorno fijo del
  -- formulario, no un dato: guardarlo repetido 200.000 veces no aporta nada.
  telefono      text not null,
  -- El RUT tal como lo escribió la persona, para poder mostrárselo igual.
  documento     text not null,

  -- ── Claves de unicidad ────────────────────────────────────────────────────
  -- Generadas por la base, no calculadas por la aplicación: así la regla vale
  -- aunque la fila entre desde el editor SQL de Supabase (brief §9).
  email_norm     text generated always as (public.email_norm(email)) stored,
  documento_norm text generated always as (public.rut_norm(documento)) stored,

  -- ── Atribución ────────────────────────────────────────────────────────────
  -- El slug del ?p= del QR, o 'directo'. El sentinela NO es un panel real: si
  -- el tráfico sin ?p= se acredita a un panel, se arruina justamente la
  -- medición que el ?p= existe para responder.
  origen        text not null default 'directo',

  -- ── Consentimiento ────────────────────────────────────────────────────────
  -- Tres columnas y no una: la Ley 21.719 exige consentimiento específico por
  -- finalidad, y fusionarlas invalida las dos. Se guarda además cuándo, porque
  -- "cuándo consintió" es parte de la prueba.
  declara_edad     boolean not null,
  acepta_bases     boolean not null,
  acepta_marketing boolean not null default false,
  consentido_at    timestamptz not null default now(),

  -- ── Estado ────────────────────────────────────────────────────────────────
  -- Baja lógica: nunca se borra una fila de inscripciones (regla dura 4). Un
  -- registro borrado no puede responder "quién participaba" seis meses después
  -- en una fiscalización.
  elegible      boolean not null default true,
  motivo_inelegible text,

  -- Lo mueve el webhook de Resend. El sorteo excluye rebotes y quejas: sin ese
  -- ciclo cerrado la reputación del dominio se deteriora sola.
  email_estado  text not null default 'pendiente'
    check (email_estado in ('pendiente','enviado','entregado','rebote','queja')),

  -- ── Columna de búsqueda del panel ─────────────────────────────────────────
  -- Materializada y sin tildes para que el índice GIN de trigramas y la
  -- consulta usen exactamente la misma regla. Si el índice se construye con
  -- una normalización y la consulta con otra, el índice deja de servir y la
  -- búsqueda se cae a un seq scan de la tabla entera.
  busqueda text generated always as (
    public.inmutable_unaccent(
      lower(nombre || ' ' || email || ' ' || documento)
    )
  ) stored,

  -- Un RUT que no se puede normalizar no puede deduplicarse, así que no entra.
  constraint inscripciones_documento_interpretable
    check (public.rut_norm(documento) is not null),
  constraint inscripciones_documento_valido
    check (public.rut_valido(documento)),
  constraint inscripciones_email_forma
    check (public.email_norm(email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$'),
  constraint inscripciones_telefono_forma
    check (telefono ~ '^[0-9]{8}$'),
  constraint inscripciones_origen_forma
    check (origen ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(origen) <= 64),
  -- Las dos obligatorias tienen que ser verdaderas: sin ellas no hay base
  -- legal para tratar el dato.
  constraint inscripciones_consentimiento_obligatorio
    check (declara_edad and acepta_bases)
);

-- ── Índices ──────────────────────────────────────────────────────────────────

-- Unicidad sobre la forma normalizada, no sobre lo que escribió la persona.
-- Se aplica también a las filas inelegibles: alguien dado de baja por fraude
-- no debe poder volver a inscribirse con el mismo RUT.
create unique index if not exists inscripciones_documento_norm_key
  on public.inscripciones (documento_norm);

create unique index if not exists inscripciones_email_norm_key
  on public.inscripciones (email_norm);

-- Paginación por cursor keyset del panel. El orden del índice es exactamente
-- el del ORDER BY de listar_inscripciones; si no coinciden, Postgres ordena en
-- memoria y el techo de db-max-rows deja de protegernos.
create index if not exists inscripciones_orden_idx
  on public.inscripciones (creado_at desc, id desc);

-- Buscador del panel: trigramas sobre el texto ya sin tildes.
create index if not exists inscripciones_busqueda_idx
  on public.inscripciones using gin (busqueda gin_trgm_ops);

-- Reporte por panel de mall (decisión abierta 05).
create index if not exists inscripciones_origen_idx
  on public.inscripciones (origen, creado_at desc);

-- Pool del sorteo: parcial, porque solo se consulta el subconjunto elegible y
-- con correo sano. Un índice parcial sobre ~95% de las filas sigue siendo
-- mucho más chico que la tabla y evita tocarla para armar el pool.
create index if not exists inscripciones_pool_idx
  on public.inscripciones (creado_at)
  where elegible and email_estado not in ('rebote','queja');
