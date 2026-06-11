-- ─────────────────────────────────────────────────────────────────────
-- 20260612000060 — FIX correctif sync : TVA réelle + zone professionnel
--
-- Contexte (V10-sync-tva-photos) :
--   1. TVA EN DUR — la fonction sync_produit_to_products()
--      (migration 20260611000010) écrivait tva_taux = 5.5 EN DUR dans
--      `products` pour TOUS les produits, alors que le barème métier
--      (WORKFLOW.md §11) impose :
--        - Alimentaire (défaut) ........... 5.5 %
--        - Traiteur, Boissons ............. 10 %
--        - Hygiène, Bazar ................. 20 %
--      Conséquence : les boissons et le bazar étaient facturés au mauvais
--      taux de TVA côté Pro (set_ligne_tva_taux copie products.tva_taux).
--
--   2. ZONE PRO — la fonction sync_drive_order_to_stock()
--      (migration 20260531000004) routait toute ligne non-traiteur vers
--      la zone 'particulier'. Les produits Pro (produits.client_type='pro')
--      tombaient donc dans la mauvaise file du Kanban préparation. On
--      route désormais client_type='pro' → 'professionnel'.
--
-- Append-only, idempotent (create or replace + backfill upsert).
-- La table `produits` n'a PAS de colonne TVA dédiée : le taux est dérivé
-- de drive_category (source de vérité Drive) via tva_taux_pour_categorie().
-- ─────────────────────────────────────────────────────────────────────

-- ── Helper : barème TVA dérivé de la catégorie Drive (WORKFLOW.md §11).
-- Immutable : même entrée → même sortie, pas d'I/O. Utilisée par le
-- trigger de sync produits ET par le backfill.
create or replace function public.tva_taux_pour_categorie(p_categorie text)
returns numeric
language sql
immutable
as $$
  select case lower(coalesce(p_categorie, ''))
    when 'boissons' then 10.0
    when 'traiteur' then 10.0
    when 'bazar'    then 20.0
    when 'hygiene'  then 20.0
    when 'hygiène'  then 20.0
    else 5.5  -- Alimentaire par défaut (boucherie, charcuterie, epicerie, frais, surgele, fruits-legumes…)
  end::numeric;
$$;

-- ── FIX 1 : sync_produit_to_products() lit le taux RÉEL au lieu de 5.5.
-- On dérive le taux de produits.drive_category. Pour les produits explicitement
-- traiteur (est_traiteur=true) on force 10 %. Reste identique à la version
-- 20260611000010 hormis la colonne tva_taux.
create or replace function public.sync_produit_to_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tva numeric;
begin
  if coalesce(new.visible_drive, false) = true then
    -- Taux réel : traiteur prioritaire, sinon barème catégorie.
    v_tva := case
      when coalesce(new.est_traiteur, false) = true then 10.0
      else public.tva_taux_pour_categorie(new.drive_category)
    end;

    insert into public.products as t (
      id, name, description, price_cents, unit, category, image_url,
      in_stock, tva_taux, unit_type,
      price_per_kg, estimated_weight_kg, poids_min_kg, poids_max_kg,
      updated_at
    )
    values (
      new.id,
      new.nom,
      coalesce(new.description_drive, ''),
      coalesce(new.prix_drive_cents, 0),
      coalesce(new.drive_unit, 'piece'),
      coalesce(new.drive_category, 'epicerie'),
      coalesce(new.image_drive_url, ''),
      true,
      v_tva,
      coalesce(new.unit_type, 'unit'),
      new.price_per_kg,
      new.estimated_weight_kg,
      new.poids_min_kg,
      new.poids_max_kg,
      now()
    )
    on conflict (id) do update set
      name                = excluded.name,
      description         = excluded.description,
      price_cents         = excluded.price_cents,
      unit                = excluded.unit,
      category            = excluded.category,
      image_url           = excluded.image_url,
      in_stock            = true,
      tva_taux            = excluded.tva_taux,
      unit_type           = excluded.unit_type,
      price_per_kg        = excluded.price_per_kg,
      estimated_weight_kg = excluded.estimated_weight_kg,
      poids_min_kg        = excluded.poids_min_kg,
      poids_max_kg        = excluded.poids_max_kg,
      updated_at          = now();
  else
    update public.products
       set in_stock = false, updated_at = now()
     where id = new.id and in_stock is distinct from false;
  end if;

  return new;
end;
$$;

-- Le trigger existe déjà (20260611000010) et pointe sur cette fonction —
-- create or replace suffit, pas besoin de recréer le trigger.

-- ── Backfill TVA : recalcule tva_taux sur les lignes products déjà
-- synchronisées depuis un produit visible Drive. On ne touche QUE les
-- lignes dont le taux courant diffère du taux dérivé (surgical).
update public.products t
   set tva_taux = case
         when coalesce(p.est_traiteur, false) = true then 10.0
         else public.tva_taux_pour_categorie(p.drive_category)
       end,
       updated_at = now()
  from public.produits p
 where p.id = t.id
   and coalesce(p.visible_drive, false) = true
   and t.tva_taux is distinct from (case
         when coalesce(p.est_traiteur, false) = true then 10.0
         else public.tva_taux_pour_categorie(p.drive_category)
       end);

-- ─────────────────────────────────────────────────────────────────────
-- ── FIX 2 : sync_drive_order_to_stock() route les lignes Pro vers la
-- zone 'professionnel'. Identique à la version 20260531000004 (matching
-- UUID → ean → nom → placeholder) hormis le calcul de v_zone, qui prend
-- en compte produits.client_type='pro'.
-- ─────────────────────────────────────────────────────────────────────
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
  v_client_type text;
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

  if v_statut is null then return NEW; end if;

  select coalesce(nullif(p.full_name, ''), NEW.customer_email, 'Client Drive')
    into v_client_nom
    from public.profiles p
   where p.id = NEW.user_id;
  if v_client_nom is null then v_client_nom := 'Client Drive'; end if;

  select slot_start into v_creneau
    from public.pickup_slots
   where id = NEW.pickup_slot_id;
  if v_creneau is null then v_creneau := now() + interval '2 hours'; end if;

  select id into v_default_depot_id
    from public.depots where nom = 'Particulier' limit 1;

  select id into v_placeholder_id from public.produits
   where ean = '0000000000000' limit 1;
  if v_placeholder_id is null then
    insert into public.produits (ean, nom, marque, categorie, requires_barcode_print, est_traiteur)
    values ('0000000000000', 'Produit Drive non synchronisé', 'SALAM', 'Épicerie', false, false)
    returning id into v_placeholder_id;
  end if;

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

  if v_statut not in ('a_preparer','en_preparation') then return NEW; end if;

  delete from public.commandes_drive_lignes
   where commande_id = NEW.id
     and statut_preparation = 'en_attente';

  if NEW.items is null or jsonb_typeof(NEW.items) <> 'array' then
    return NEW;
  end if;

  for v_item in select * from jsonb_array_elements(NEW.items) loop
    v_produit_stock_id := null;
    v_est_traiteur    := false;
    v_client_type     := 'particulier';

    -- 1) Match par UUID (chemin idéal — Drive nouveau format)
    v_candidate_uuid := null;
    begin
      v_candidate_uuid := nullif(v_item->>'produit_id', '')::uuid;
    exception when invalid_text_representation then
      v_candidate_uuid := null;
    end;

    if v_candidate_uuid is not null then
      select id, est_traiteur, client_type
        into v_produit_stock_id, v_est_traiteur, v_client_type
        from public.produits
       where id = v_candidate_uuid
       limit 1;
    end if;

    -- 2) Match par EAN (chemin robuste)
    if v_produit_stock_id is null then
      v_candidate_ean := nullif(v_item->>'ean', '');
      if v_candidate_ean is not null then
        select id, est_traiteur, client_type
          into v_produit_stock_id, v_est_traiteur, v_client_type
          from public.produits
         where ean = v_candidate_ean
         limit 1;
      end if;
    end if;

    -- 3) Match par nom (rétro-compat ancien format Drive)
    if v_produit_stock_id is null then
      v_candidate_name := nullif(v_item->>'name', '');
      if v_candidate_name is not null then
        select id, est_traiteur, client_type
          into v_produit_stock_id, v_est_traiteur, v_client_type
          from public.produits
         where lower(nom) = lower(v_candidate_name)
         limit 1;

        if v_produit_stock_id is null then
          select id, est_traiteur, client_type
            into v_produit_stock_id, v_est_traiteur, v_client_type
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
      v_client_type      := 'particulier';
    end if;

    -- Routage de zone : traiteur prioritaire, puis Pro, puis particulier.
    v_zone := case
      when coalesce(v_est_traiteur, false) = true then 'traiteur'::zone_preparation_drive
      when lower(coalesce(v_client_type, 'particulier')) = 'pro'
        then 'professionnel'::zone_preparation_drive
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

-- Le trigger sync_drive_order_to_stock_trigger existe déjà sur orders et
-- pointe sur cette fonction (20260531000004) — create or replace suffit.

notify pgrst, 'reload schema';
