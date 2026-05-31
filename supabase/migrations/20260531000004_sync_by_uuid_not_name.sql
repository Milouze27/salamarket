-- ════════════════════════════════════════════════════════════════
-- 20260531000004 — Sync trigger : matcher produits par UUID au lieu du nom
--
-- CONTEXTE
-- La fonction public.sync_drive_order_to_stock() (cf. _archive/0022)
-- matche les items.JSONB d'orders → produits par :
--   where lower(nom) = lower(v_item->>'name')
--   fallback prefix : where lower(nom) like lower(v_item->>'name') || '%'
--   fallback placeholder : produit "Produit Drive non synchronisé"
--
-- Problèmes :
--   1. Si Drive renomme un produit (ex "Couscous moyen 1kg" → "Couscous
--      moyen 1 kg"), tous les nouveaux orders tombent en placeholder.
--   2. Deux produits homonymes (ex "Pâtes" en zone particulier et en
--      zone pro) → match arbitraire selon ORDER BY implicite.
--   3. Le Kanban Stock affiche le mauvais produit, casse l'inventaire.
--
-- FIX
-- On exige désormais que le Drive insère `produit_id` (UUID texte) dans
-- chaque item de orders.items. Le trigger essaie :
--   1. UUID direct : where id = (v_item->>'produit_id')::uuid
--   2. Fallback ean : where ean = v_item->>'ean'
--   3. Fallback nom (rétro-compatibilité) : where lower(nom) = lower(name)
--   4. Fallback placeholder si rien trouvé
--
-- Côté Drive (apps/drive), il faudra ajouter produit_id à chaque ligne
-- dans le flux create-checkout-session. C'est dans le scope d'un autre
-- agent ; ici on prépare la DB pour les deux schémas.
-- ════════════════════════════════════════════════════════════════

create or replace function public.sync_drive_order_to_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut text;
  v_item jsonb;
  v_produit_stock_id uuid;
  v_est_traiteur boolean;
  v_default_depot_id uuid;
  v_placeholder_id uuid;
  v_zone zone_preparation_drive;
  v_client_nom text;
  v_creneau timestamptz;
  v_candidate_uuid uuid;
  v_candidate_ean text;
  v_candidate_name text;
begin
  -- Map status Drive → statut Stock Kanban
  v_statut := case
    when NEW.status = 'confirmed' then 'a_preparer'
    when NEW.status = 'preparing' then 'en_preparation'
    when NEW.status = 'ready'     then 'pret'
    when NEW.status = 'picked_up' then 'retire'
    when NEW.status = 'cancelled' then 'annule'
    else null
  end;

  -- 'pending' = order créée mais pas payée → on ignore
  if v_statut is null then return NEW; end if;

  -- Nom client
  select coalesce(nullif(p.full_name, ''), NEW.customer_email, 'Client Drive')
    into v_client_nom
    from public.profiles p
   where p.id = NEW.user_id;
  if v_client_nom is null then v_client_nom := 'Client Drive'; end if;

  -- Créneau retrait
  select slot_start into v_creneau
    from public.pickup_slots
   where id = NEW.pickup_slot_id;
  if v_creneau is null then v_creneau := now() + interval '2 hours'; end if;

  -- Dépôt destination par défaut
  select id into v_default_depot_id
    from public.depots where nom = 'Particulier' limit 1;

  -- Produit placeholder pour les lignes orphelines
  select id into v_placeholder_id from public.produits
   where ean = '0000000000000' limit 1;
  if v_placeholder_id is null then
    insert into public.produits (ean, nom, marque, categorie, requires_barcode_print, est_traiteur)
    values ('0000000000000', 'Produit Drive non synchronisé', 'SALAM', 'Épicerie', false, false)
    returning id into v_placeholder_id;
  end if;

  -- Upsert commande_drive header
  insert into public.commandes_drive (
    id, numero_commande, client_nom, client_telephone, client_email,
    creneau_retrait, statut, total_ttc, mode_paiement, created_at
  ) values (
    NEW.id, NEW.id::text, v_client_nom, NEW.customer_phone, NEW.customer_email,
    v_creneau, v_statut, (NEW.total_cents::numeric / 100),
    case when NEW.payment_method = 'in_store' then 'en_magasin' else 'stripe' end,
    NEW.created_at
  )
  on conflict (id) do update set
    statut = case
      when commandes_drive.statut in ('pret','retire') then commandes_drive.statut
      else excluded.statut
    end,
    creneau_retrait = excluded.creneau_retrait,
    client_nom = excluded.client_nom,
    client_telephone = excluded.client_telephone,
    client_email = excluded.client_email,
    total_ttc = excluded.total_ttc;

  -- Sync lignes uniquement aux états modifiables
  if v_statut not in ('a_preparer','en_preparation') then return NEW; end if;

  delete from public.commandes_drive_lignes
   where commande_id = NEW.id
     and statut_preparation = 'en_attente';

  if NEW.items is null or jsonb_typeof(NEW.items) <> 'array' then
    return NEW;
  end if;

  -- Boucle items : on essaie UUID → ean → nom → placeholder
  for v_item in select * from jsonb_array_elements(NEW.items) loop
    v_produit_stock_id := null;
    v_est_traiteur    := false;

    -- 1) Match par UUID (chemin idéal — Drive nouveau format)
    v_candidate_uuid := null;
    begin
      v_candidate_uuid := nullif(v_item->>'produit_id', '')::uuid;
    exception when invalid_text_representation then
      v_candidate_uuid := null;
    end;

    if v_candidate_uuid is not null then
      select id, est_traiteur
        into v_produit_stock_id, v_est_traiteur
        from public.produits
       where id = v_candidate_uuid
       limit 1;
    end if;

    -- 2) Match par EAN (chemin robuste — Drive expose souvent un ean)
    if v_produit_stock_id is null then
      v_candidate_ean := nullif(v_item->>'ean', '');
      if v_candidate_ean is not null then
        select id, est_traiteur
          into v_produit_stock_id, v_est_traiteur
          from public.produits
         where ean = v_candidate_ean
         limit 1;
      end if;
    end if;

    -- 3) Match par nom (rétro-compat ancien format Drive)
    if v_produit_stock_id is null then
      v_candidate_name := nullif(v_item->>'name', '');
      if v_candidate_name is not null then
        select id, est_traiteur
          into v_produit_stock_id, v_est_traiteur
          from public.produits
         where lower(nom) = lower(v_candidate_name)
         limit 1;

        -- 3b) Fallback préfixe
        if v_produit_stock_id is null then
          select id, est_traiteur
            into v_produit_stock_id, v_est_traiteur
            from public.produits
           where lower(nom) like lower(v_candidate_name) || '%'
           limit 1;
        end if;
      end if;
    end if;

    -- 4) Placeholder en dernier recours
    if v_produit_stock_id is null then
      v_produit_stock_id := v_placeholder_id;
      v_est_traiteur     := false;
    end if;

    v_zone := case when v_est_traiteur
      then 'traiteur'::zone_preparation_drive
      else 'particulier'::zone_preparation_drive
    end;

    insert into public.commandes_drive_lignes (
      commande_id, produit_id, depot_id, zone_preparation,
      quantite, prix_unitaire, statut_preparation
    ) values (
      NEW.id, v_produit_stock_id, v_default_depot_id, v_zone,
      (v_item->>'quantity')::numeric,
      ((v_item->>'unit_price_cents')::numeric) / 100.0,
      'en_attente'
    )
    on conflict do nothing;
  end loop;

  return NEW;
end;
$$;

-- Trigger inchangé : drop/recreate par sécurité
drop trigger if exists sync_drive_order_to_stock_trigger on public.orders;
create trigger sync_drive_order_to_stock_trigger
  after insert or update on public.orders
  for each row
  execute function public.sync_drive_order_to_stock();

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- À FAIRE CÔTÉ DRIVE (autre agent / autre PR) :
-- apps/drive/.../create-checkout-session/* doit insérer pour chaque item :
--   { name: "Couscous moyen", quantity: 1, unit_price_cents: 590,
--     produit_id: "uuid-du-produits-id",    ← AJOUT
--     ean: "1234567890123" }                ← BONUS robustesse
-- ════════════════════════════════════════════════════════════════
