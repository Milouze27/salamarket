-- ════════════════════════════════════════════════════════════════
-- 20260531000001 — Fix sync_stock_statut_to_drive : remap completed→picked_up et canceled→cancelled
--
-- CONTEXTE
-- La migration _archive/0009_sync_drive_orders.sql avait mappé les
-- statuts Stock vers les statuts Drive avec :
--   'retire' → 'completed'
--   'annule' → 'canceled'
-- Or la migration _archive/0022_unify_drive_into_stock.sql a redéfini
-- public.orders avec un CHECK constraint :
--   status in ('pending','confirmed','preparing','ready','picked_up','cancelled')
--
-- Conséquence : dès qu'un préparateur Stock passe une commande à 'retire'
-- ou 'annule', le trigger sync_stock_statut_to_drive tente d'UPDATE
-- orders.status = 'completed' / 'canceled' → CHECK violation, séquence
-- "pret → retire" plante en demo.
--
-- FIX
-- CREATE OR REPLACE FUNCTION public.sync_stock_statut_to_drive avec le
-- mapping correct miroir de sync_drive_order_to_stock (0022) :
--   'a_preparer'     → 'confirmed'
--   'en_preparation' → 'preparing'
--   'pret'           → 'ready'
--   'retire'         → 'picked_up'   (← FIX, ex 'completed')
--   'annule'         → 'cancelled'   (← FIX, ex 'canceled' single l)
--
-- Idempotent : CREATE OR REPLACE, trigger inchangé.
-- ════════════════════════════════════════════════════════════════

create or replace function public.sync_stock_statut_to_drive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drive_status text;
begin
  -- Ne réagit qu'aux changements de statut
  if NEW.statut = OLD.statut then
    return NEW;
  end if;

  v_drive_status := case
    when NEW.statut = 'a_preparer'     then 'confirmed'
    when NEW.statut = 'en_preparation' then 'preparing'
    when NEW.statut = 'pret'           then 'ready'
    when NEW.statut = 'retire'         then 'picked_up'
    when NEW.statut = 'annule'         then 'cancelled'
    else null
  end;

  if v_drive_status is null then
    return NEW;
  end if;

  -- Update seulement si la commande Drive existe avec un statut différent.
  -- WHERE id = NEW.id parce que commandes_drive.id = orders.id (1-1).
  update public.orders
     set status = v_drive_status,
         updated_at = now()
   where id = NEW.id
     and status is distinct from v_drive_status;

  return NEW;
end;
$$;

-- (Re)attache le trigger au cas où il aurait été drop.
drop trigger if exists sync_stock_statut_to_drive on public.commandes_drive;
create trigger sync_stock_statut_to_drive
  after update of statut on public.commandes_drive
  for each row
  execute function public.sync_stock_statut_to_drive();

notify pgrst, 'reload schema';
