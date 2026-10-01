-- Esquema inicial de Paint Studio en Supabase: colección y recetas de cada usuario, más su auditoría.
--
-- Todo va en una sola migración para que nunca exista una tabla sin su RLS ni sin sus triggers.
-- Postgres es la frontera de seguridad: la clave publicable viaja en el bundle, así que lo que
-- un usuario puede hacer lo decide esto, no el cliente.
--
-- Nada se borra físicamente. El borrado es lógico (deleted_at) y el DELETE/TRUNCATE se bloquea en
-- tres capas: sin política DELETE, sin GRANT y con un trigger que también para al dueño y a
-- service_role (que tiene BYPASSRLS). Un borrado legítimo futuro (RGPD) exige otra migración.

-- Las funciones de trigger viven en un esquema que la API no expone y en el que ningún rol de
-- cliente tiene USAGE: los triggers se disparan igual, pero nadie puede llamarlas directamente.
create schema private;
revoke all on schema private from public, anon, authenticated, service_role;

-- PK compuesta (user_id, clave): un ON CONFLICT nunca choca con la fila de otro usuario, y la PK
-- sirve de índice para el filtro user_id = auth.uid() de la RLS.
-- on delete restrict: borrar un usuario de auth.users con datos falla; borrar una cuenta es un
-- proceso manual y explícito.
create table public.collection_entries (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete restrict,
  code       text        not null check (length(code) between 1 and 64),
  status     text        not null check (status in ('owned', 'wishlist')),
  level      smallint    not null check (level between 0 and 3),
  note       text        check (note is null or length(note) <= 10000),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, code)
);

create table public.recipes (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete restrict,
  id         text        not null check (length(id) between 1 and 200),
  -- coalesce: sin él, una receta sin "zones" da NULL y el CHECK pasa (fallo encontrado en la verificación)
  data       jsonb       not null check (jsonb_typeof(data) = 'object'
                                         and coalesce(jsonb_typeof(data -> 'zones') = 'array', false)),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- Auditoría de solo inserción. Solo escriben los triggers (SECURITY DEFINER): si el cliente
-- pudiera insertar, podría falsificar el historial. Está en public para que cada usuario lea el
-- suyo sin necesitar la clave secreta.
create table public.change_log (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null,
  table_name text        not null check (table_name in ('collection_entries', 'recipes')),
  row_key    text        not null,
  action     text        not null check (action in ('updated', 'rejected_stale')),
  old_row    jsonb       not null,
  new_row    jsonb       not null,
  logged_at  timestamptz not null default now()
);
create index change_log_user_logged_at_idx on public.change_log (user_id, logged_at desc);

-- Guardia de escritura más reciente (LWW). Devuelve NULL para descartar la fila sin lanzar error:
-- un RAISE abortaría la sentencia entera y, con ella, todo el lote del upsert (p. ej. el volcado
-- del primer login) por una sola fila antigua. Como una fila descartada no dispara el AFTER UPDATE,
-- la propia guardia registra el rechazo; si no, la pérdida por un reloj atrasado sería invisible.
-- La clave sí lanza: PostgREST pone todas las columnas en el SET del upsert, también la clave, y
-- cambiarla equivaldría a borrar la fila vieja.
create function private.guard_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare key_column constant text := tg_argv[0];
begin
  if new.user_id is distinct from old.user_id
     or to_jsonb(new) ->> key_column is distinct from to_jsonb(old) ->> key_column then
    raise exception 'No se puede cambiar el usuario ni la clave de una fila de %', tg_table_name
      using errcode = '42501';
  end if;
  if new is not distinct from old then
    return null;                                   -- no-op: volcado repetido, sin auditar
  end if;
  if new.updated_at < old.updated_at then
    insert into public.change_log (user_id, table_name, row_key, action, old_row, new_row)
    values (old.user_id, tg_table_name, to_jsonb(old) ->> key_column, 'rejected_stale', to_jsonb(old), to_jsonb(new));
    return null;                                   -- descarta la fila sin abortar el lote
  end if;
  return new;
end $$;

-- Registra cada UPDATE aplicado, con la fila anterior y la nueva: lo pisado se puede recuperar.
create function private.log_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.change_log (user_id, table_name, row_key, action, old_row, new_row)
  values (old.user_id, tg_table_name, to_jsonb(old) ->> tg_argv[0], 'updated', to_jsonb(old), to_jsonb(new));
  return null;
end $$;

-- Sin SECURITY DEFINER: solo lanza, no necesita privilegios de nadie.
create function private.forbid_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Borrado físico prohibido en %: usa deleted_at', tg_table_name using errcode = '42501';
end $$;

create function private.forbid_change_log_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'change_log es de solo inserción' using errcode = '42501';
end $$;

revoke all on function private.guard_update(), private.log_update(), private.forbid_delete(),
  private.forbid_change_log_update() from public, anon, authenticated, service_role;

create trigger guard_update before update on public.collection_entries for each row execute function private.guard_update('code');
create trigger guard_update before update on public.recipes            for each row execute function private.guard_update('id');
create trigger log_update   after  update on public.collection_entries for each row execute function private.log_update('code');
create trigger log_update   after  update on public.recipes            for each row execute function private.log_update('id');
create trigger forbid_update before update on public.change_log        for each row execute function private.forbid_change_log_update();
create trigger forbid_delete before delete on public.collection_entries for each row execute function private.forbid_delete();
create trigger forbid_delete before delete on public.recipes            for each row execute function private.forbid_delete();
create trigger forbid_delete before delete on public.change_log         for each row execute function private.forbid_delete();
-- TRUNCATE no dispara los triggers de fila: necesita los suyos, por sentencia.
create trigger forbid_truncate before truncate on public.collection_entries for each statement execute function private.forbid_delete();
create trigger forbid_truncate before truncate on public.recipes            for each statement execute function private.forbid_delete();
create trigger forbid_truncate before truncate on public.change_log         for each statement execute function private.forbid_delete();

alter table public.collection_entries enable row level security;
alter table public.recipes            enable row level security;
alter table public.change_log         enable row level security;

-- Los privilegios por defecto de Supabase dan ALL a los tres roles
-- (https://supabase.com/docs/guides/api/securing-your-api#default-privileges) y la plataforma
-- los está cambiando. Revocar todo y conceder lo justo hace que el resultado no dependa de esos defaults.
revoke all on public.collection_entries, public.recipes, public.change_log from anon, authenticated, service_role;
grant select, insert on public.collection_entries to authenticated;
-- UPDATE por columna sin user_id: cambiarlo da 42501 aunque la RLS fallara. La clave sí entra
-- porque PostgREST la incluye en el SET del upsert; su inmutabilidad la impone guard_update.
grant update (code, status, level, note, updated_at, deleted_at) on public.collection_entries to authenticated;
grant select, insert on public.recipes to authenticated;
grant update (id, data, updated_at, deleted_at) on public.recipes to authenticated;
grant select on public.change_log to authenticated;

-- (select auth.uid()) entre paréntesis para que el planner lo evalúe una sola vez por sentencia,
-- como recomienda la guía de RLS de Supabase. UPDATE exige USING y WITH CHECK: la fila vieja y la
-- nueva tienen que ser del mismo usuario.
create policy select_own on public.collection_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy insert_own on public.collection_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy update_own on public.collection_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy select_own on public.recipes for select to authenticated using ((select auth.uid()) = user_id);
create policy insert_own on public.recipes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy update_own on public.recipes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy select_own on public.change_log for select to authenticated using ((select auth.uid()) = user_id);
-- No hay política DELETE en ninguna tabla. `anon` no tiene ningún GRANT.
