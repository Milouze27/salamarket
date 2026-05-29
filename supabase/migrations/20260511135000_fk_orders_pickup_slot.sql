-- ════════════════════════════════════════════════════════════════
-- Fix : ajoute la FK orders.pickup_slot_id → pickup_slots.id
--
-- Sans cette contrainte, PostgREST ne peut pas auto-joiner
-- pickup_slots dans /orders?select=*,pickup_slot:pickup_slots(...)
-- → le champ `pickup_slot` revient null silencieusement, ce qui
-- déclenche "Créneau à confirmer" sur la page /commande/confirmee/...
-- alors qu'on a payé un créneau précis.
-- ════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'orders'
      and constraint_name = 'orders_pickup_slot_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_pickup_slot_id_fkey
      foreign key (pickup_slot_id)
      references public.pickup_slots(id)
      on delete set null;
  end if;
end$$;

-- Notifie PostgREST du nouveau schéma pour éviter de redémarrer.
notify pgrst, 'reload schema';
