-- Auditoría: cada UPDATE aplicado deja una fila 'updated' y cada rechazo de la guardia LWW una
-- 'rejected_stale', ambas con la fila anterior y la nueva. Un no-op no deja rastro. change_log es
-- de solo inserción (solo escriben los triggers) y cada usuario lee únicamente su historial.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.collection_entries (user_id, code, status, level, note, updated_at, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'AK-A', 'owned', 1, null, '2026-01-02T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 'AK-B', 'owned', 1, null, '2026-01-02T00:00:00Z', null);
insert into public.recipes (user_id, id, data, updated_at, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'receta-a', '{"name":"Original","zones":[]}', '2026-01-02T00:00:00Z', null);

-- Sin GRANT de escritura sobre change_log. La falta de política de INSERT daría el mismo 42501,
-- así que esto se comprueba aparte para que no se pierda una capa.
select ok(not has_table_privilege('authenticated', 'public.change_log', 'INSERT')
      and not has_table_privilege('authenticated', 'public.change_log', 'UPDATE'),
  'authenticated no tiene INSERT ni UPDATE sobre change_log');

-- Como el usuario A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$update public.collection_entries set level = 2, updated_at = '2026-01-03T00:00:00Z' where code = 'AK-A'$$,
  'A aplica un UPDATE más nuevo'
);
select results_eq(
  $$select user_id, table_name, row_key, action, old_row ->> 'level', new_row ->> 'level'
    from public.change_log where row_key = 'AK-A'$$,
  $$values ('11111111-1111-1111-1111-111111111111'::uuid, 'collection_entries'::text, 'AK-A'::text,
            'updated'::text, '1'::text, '2'::text)$$,
  'el UPDATE aplicado deja una fila updated con el valor anterior y el nuevo'
);

select lives_ok(
  $$update public.collection_entries set level = 3, updated_at = '2026-01-01T00:00:00Z' where code = 'AK-A'$$,
  'A manda un UPDATE más antiguo sin recibir error'
);
select results_eq(
  $$select old_row ->> 'level', new_row ->> 'level', (new_row ->> 'updated_at')::timestamptz
    from public.change_log where row_key = 'AK-A' and action = 'rejected_stale'$$,
  $$values ('2'::text, '3'::text, '2026-01-01T00:00:00Z'::timestamptz)$$,
  'el rechazo por LWW queda como rejected_stale, con lo guardado y lo que se intentó escribir'
);
select results_eq(
  $$select level, updated_at from public.collection_entries where code = 'AK-A'$$,
  $$values (2::smallint, '2026-01-03T00:00:00Z'::timestamptz)$$,
  'tras el rechazo, la fila de datos conserva exactamente sus valores'
);

-- Upsert idéntico a lo guardado, como un volcado repetido: la guardia lo trata como no-op.
select lives_ok(
  $$insert into public.collection_entries (code, status, level, note, updated_at, deleted_at)
    values ('AK-A', 'owned', 2, null, '2026-01-03T00:00:00Z', null)
    on conflict (user_id, code) do update set
      code = excluded.code, status = excluded.status, level = excluded.level,
      note = excluded.note, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at$$,
  'A repite un upsert idéntico a lo guardado'
);
select is(
  (select count(*) from public.change_log where row_key = 'AK-A'),
  2::bigint,
  'el upsert idéntico no genera ninguna fila de auditoría'
);

select lives_ok(
  $$update public.recipes set data = '{"name":"Nueva","zones":[]}', updated_at = '2026-01-03T00:00:00Z'
    where id = 'receta-a'$$,
  'A aplica un UPDATE más nuevo a su receta'
);
select results_eq(
  $$select table_name, action, old_row -> 'data' ->> 'name', new_row -> 'data' ->> 'name'
    from public.change_log where row_key = 'receta-a'$$,
  $$values ('recipes'::text, 'updated'::text, 'Original'::text, 'Nueva'::text)$$,
  'el UPDATE de una receta también se audita'
);

-- Solo escriben los triggers: si el cliente pudiera, falsificaría el historial.
select throws_ok(
  $$insert into public.change_log (user_id, table_name, row_key, action, old_row, new_row)
    values ('11111111-1111-1111-1111-111111111111', 'recipes', 'receta-a', 'updated', '{}', '{}')$$,
  '42501', null,
  'el cliente no puede insertar directamente en la auditoría'
);
select throws_ok(
  $$update public.change_log set action = 'updated'$$,
  '42501', null,
  'el cliente no puede modificar la auditoría'
);

-- Como el usuario B: genera su propio historial y solo ve ese.
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$update public.collection_entries set level = 0, updated_at = '2026-01-03T00:00:00Z' where code = 'AK-B'$$,
  'B aplica un UPDATE más nuevo a su fila'
);
select results_eq(
  $$select user_id, row_key from public.change_log$$,
  $$values ('22222222-2222-2222-2222-222222222222'::uuid, 'AK-B'::text)$$,
  'B solo ve su propio historial'
);

-- De nuevo como A: ve sus tres filas y ninguna de B.
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select row_key, action from public.change_log order by id$$,
  $$values ('AK-A'::text, 'updated'::text), ('AK-A', 'rejected_stale'), ('receta-a', 'updated')$$,
  'A solo ve su propio historial'
);

-- Ni el dueño de las tablas puede reescribir la auditoría: lo para el trigger.
reset role;

select throws_ok(
  $$update public.change_log set action = 'updated'$$,
  '42501', 'change_log es de solo inserción',
  'el dueño de las tablas no puede modificar la auditoría'
);
-- Filtrado por los dos usuarios que siembra este test: sin filtro, un count(*) contaría también
-- cualquier fila ajena ya presente en la tabla y el test dejaría de ser reproducible fuera de una
-- base recién reseteada.
select is(
  (select count(*) from public.change_log
    where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  4::bigint,
  'la auditoría tiene exactamente las cuatro filas generadas por los triggers'
);

select * from finish();
rollback;
