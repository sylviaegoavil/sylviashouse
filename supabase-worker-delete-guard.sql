-- ============================================================================
-- Worker delete guard
-- Run in the Supabase SQL Editor, REVIEWING EACH STEP. Nothing here is executed by the app.
--
-- Why: orders.worker_id is ON DELETE CASCADE, so deleting a worker row deletes
-- all of its orders. A worker may exist in several groups (one row per group,
-- same DNI), so "has history" must be judged per DNI across ALL groups.
-- ============================================================================


-- ─── STEP 1 — Atomic delete that refuses any DNI with orders ─────────────────
-- Deletes only the given workers whose DNI has NO order in ANY group
-- (any worker row with the same doc_number, active or inactive, any group).
-- Returns the ids actually deleted. Workers with history are silently skipped.

create or replace function public.delete_workers_without_orders(p_ids uuid[])
returns table (deleted_id uuid)
language sql
as $$
  with target as (
    select id, doc_number from public.workers where id = any (p_ids)
  ), blocked as (
    select t.id
    from target t
    where exists (
      select 1
      from public.workers w2
      join public.orders o on o.worker_id = w2.id
      where w2.doc_number = t.doc_number
    )
  )
  delete from public.workers w
  using target t
  where w.id = t.id
    and w.id not in (select id from blocked)
  returning w.id
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions by default, which would let the
-- anonymous API key call this delete. Restrict it to the server (service role) only.
revoke execute on function public.delete_workers_without_orders(uuid[]) from public, anon, authenticated;
grant  execute on function public.delete_workers_without_orders(uuid[]) to service_role;


-- ─── STEP 2a — LOOK at the real foreign key on orders.worker_id (read-only) ──
-- confdeltype: 'c' = CASCADE, 'a' = NO ACTION, 'r' = RESTRICT, 'n' = SET NULL.
-- Expected: one row, usually named orders_worker_id_fkey, confdeltype = 'c'.

select c.conname      as constraint_name,
       c.confdeltype  as on_delete,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.conrelid = 'public.orders'::regclass
  and c.contype = 'f'
  and a.attname = 'worker_id';


-- ─── STEP 2b — Replace CASCADE with NO ACTION (safety net) ───────────────────
-- Run only after checking 2a. With NO ACTION the database refuses to delete a
-- worker that still has orders, even if application code had a bug.
-- NO ACTION (not RESTRICT) so deleting a whole group — which removes its
-- workers and orders in the same statement — keeps working.
--
-- Option 1: use the name returned by 2a (replace it if it differs):
--
--   alter table public.orders drop constraint orders_worker_id_fkey;
--   alter table public.orders add constraint orders_worker_id_fkey
--     foreign key (worker_id) references public.workers (id);
--
-- Option 2: name-agnostic block (aborts unless exactly ONE FK exists on worker_id):
--
--   do $$
--   declare fk_name text; fk_count int;
--   begin
--     select count(*), max(c.conname) into fk_count, fk_name
--     from pg_constraint c
--     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
--     where c.conrelid = 'public.orders'::regclass and c.contype = 'f'
--       and a.attname = 'worker_id';
--     if fk_count <> 1 then
--       raise exception 'Expected exactly 1 FK on orders.worker_id, found %', fk_count;
--     end if;
--     execute format('alter table public.orders drop constraint %I', fk_name);
--     execute format(
--       'alter table public.orders add constraint %I foreign key (worker_id) references public.workers (id)',
--       fk_name);
--   end $$;
--
-- Verify afterwards by re-running 2a: on_delete should be 'a'.
-- Rollback (back to the previous behaviour):
--   alter table public.orders drop constraint orders_worker_id_fkey;
--   alter table public.orders add constraint orders_worker_id_fkey
--     foreign key (worker_id) references public.workers (id) on delete cascade;
