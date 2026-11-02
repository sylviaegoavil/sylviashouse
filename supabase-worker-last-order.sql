-- ============================================================================
-- Function: worker_last_orders
-- Last order date (and total count) per worker, over ALL of orders (no date filter).
-- Used by "Trabajadores sin actividad" (dashboard + /workers).
--
-- * Orders with worker_id NULL (TXT / manual adicionales) are excluded.
-- * p_group_ids optionally limits the orders considered to those groups
--   (the app passes the groups of the selected client). NULL = all groups.
-- * Read-only (STABLE). Creates/replaces a function only; touches no data.
-- Run this in the Supabase SQL Editor ONCE.
-- ============================================================================

create or replace function public.worker_last_orders(p_group_ids uuid[] default null)
returns table (worker_id uuid, last_order_date date, order_count bigint)
language sql
stable
as $$
  select o.worker_id,
         max(o.order_date) as last_order_date,
         count(*)          as order_count
  from public.orders o
  where o.worker_id is not null
    and (p_group_ids is null or o.group_id = any (p_group_ids))
  group by o.worker_id
$$;

grant execute on function public.worker_last_orders(uuid[]) to anon, authenticated, service_role;

-- Quick check (ALEX ALVARADO should show ~12 and ~14 orders, last in March 2026):
-- select w.id, g.name, w.doc_number, l.order_count, l.last_order_date
-- from workers w
-- join groups g on g.id = w.group_id
-- left join public.worker_last_orders() l on l.worker_id = w.id
-- where w.doc_number = '71842610';
