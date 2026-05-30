-- ════════════════════════════════════════════════════════════════
-- 0037 — Réception "scanner-first"
--
-- Otmane prend le scan en main et ne saisit plus rien : températures
-- relevées, lots scannés, écarts calculés en temps réel, timeline
-- conservée pour audit comptable.
--
-- Extension de bons_de_livraison (migré 0012) + lignes.
-- Lot ID référence produits_lots (migré 0031).
-- ════════════════════════════════════════════════════════════════

-- ─── Extension du BDL : température + écart + validation compta ───
alter table public.bons_de_livraison
  add column if not exists temperature_reception_c     numeric(4,1),
  add column if not exists temperature_seuil_max_c     numeric(4,1) not null default 4.0,
  add column if not exists ecart_valeur_eur            numeric(12,2) not null default 0,
  add column if not exists valide_par_comptable        uuid references public.employes(id),
  add column if not exists valide_par_comptable_le     timestamptz,
  add column if not exists scan_started_at             timestamptz,
  add column if not exists scan_completed_at           timestamptz;

create index if not exists idx_bdl_ecart_non_zero
  on public.bons_de_livraison(receptionne_le desc)
  where ecart_valeur_eur <> 0;

create index if not exists idx_bdl_validation_compta
  on public.bons_de_livraison(valide_par_comptable_le desc)
  where valide_par_comptable is not null;

-- ─── Extension des lignes BDL : lot scanné + cartons + écart ──────
alter table public.bons_de_livraison_lignes
  add column if not exists lot_id              text references public.produits_lots(id),
  add column if not exists nb_cartons_scannes  integer not null default 0
                            check (nb_cartons_scannes >= 0),
  add column if not exists prix_achat_ht       numeric(10,4),
  add column if not exists scan_timeline       jsonb not null default '[]'::jsonb;

-- Ecart quantité = recu - attendu (peut être négatif ou positif)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public'
       and table_name='bons_de_livraison_lignes'
       and column_name='ecart_qte'
  ) then
    alter table public.bons_de_livraison_lignes
      add column ecart_qte integer generated always as
        (quantite_recue - quantite_attendue) stored;
  end if;
end$$;

-- Index partiel sur lignes avec écart (cockpit + page litiges)
create index if not exists idx_bdl_lignes_ecart
  on public.bons_de_livraison_lignes(bdl_id, ecart_qte)
  where ecart_qte <> 0;

create index if not exists idx_bdl_lignes_lot
  on public.bons_de_livraison_lignes(lot_id) where lot_id is not null;

-- ─── Helper : recompute ecart_valeur_eur du BDL ───────────────────
create or replace function public.bdl_recalc_ecart(p_bdl_id uuid)
returns numeric
language plpgsql
as $$
declare
  v_total numeric(12,2);
begin
  select coalesce(sum(ecart_qte * coalesce(prix_achat_ht, 0)), 0)
    into v_total
    from public.bons_de_livraison_lignes
   where bdl_id = p_bdl_id;

  update public.bons_de_livraison
     set ecart_valeur_eur = v_total
   where id = p_bdl_id;

  return v_total;
end$$;

-- Trigger : à chaque update d'une ligne, recompute le total écart du BDL
create or replace function public.tg_bdl_lignes_recalc()
returns trigger
language plpgsql
as $$
begin
  perform public.bdl_recalc_ecart(coalesce(NEW.bdl_id, OLD.bdl_id));
  return NEW;
end$$;

drop trigger if exists trg_bdl_lignes_recalc on public.bons_de_livraison_lignes;
create trigger trg_bdl_lignes_recalc
  after insert or update or delete on public.bons_de_livraison_lignes
  for each row execute function public.tg_bdl_lignes_recalc();

-- ─── Helper : push un event dans la scan_timeline ─────────────────
-- Usage côté app : select bdl_ligne_push_event(:ligne_id, jsonb_build_object(...))
create or replace function public.bdl_ligne_push_event(
  p_ligne_id uuid,
  p_event    jsonb
)
returns void
language plpgsql
as $$
begin
  update public.bons_de_livraison_lignes
     set scan_timeline = scan_timeline || jsonb_build_array(
           p_event || jsonb_build_object('ts', to_jsonb(now()))
         )
   where id = p_ligne_id;
end$$;

-- ─── Vue litiges (lignes avec écart, prêtes pour la page comptable) ─
create or replace view public.v_bdl_litiges as
select
  b.id              as bdl_id,
  b.numero_bdl,
  b.fournisseur_id,
  f.nom             as fournisseur_nom,
  b.depot_destination_id,
  d.nom             as depot_nom,
  b.receptionne_le,
  b.temperature_reception_c,
  b.temperature_seuil_max_c,
  b.ecart_valeur_eur,
  b.valide_par_comptable,
  l.id              as ligne_id,
  l.produit_id,
  p.nom             as produit_nom,
  l.quantite_attendue,
  l.quantite_recue,
  l.ecart_qte,
  l.prix_achat_ht,
  (l.ecart_qte * coalesce(l.prix_achat_ht, 0))::numeric(12,2) as ecart_ligne_eur
from public.bons_de_livraison b
join public.bons_de_livraison_lignes l on l.bdl_id = b.id
left join public.fournisseurs f on f.id = b.fournisseur_id
left join public.depots d       on d.id = b.depot_destination_id
left join public.produits p     on p.id = l.produit_id
where l.ecart_qte <> 0
   or b.temperature_reception_c > b.temperature_seuil_max_c
order by b.receptionne_le desc nulls last, b.numero_bdl;

grant select on public.v_bdl_litiges to anon, authenticated;

notify pgrst, 'reload schema';
