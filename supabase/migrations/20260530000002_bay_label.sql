-- =====================================================================
-- 0033_bay_label.sql
-- Bay labels pour le pickup screen client (Bet 6).
--
-- Date         : 2026-05-30
-- Échéance     : démo 2026-06-10
-- Inspiration  : Carrefour Drive (bornes A1, A2, B1…)
--
-- Hypothèses :
--   - Aucun halal concurrent n'a d'écran de retrait → différenciateur fort.
--   - Bay = casier physique (12 bornes : A1-A6 + B1-B6) au comptoir.
--   - Assignation auto à la transition « en_preparation → pret »
--     (le staff ne choisit pas, il range où il y a de la place).
--   - Libération de bay = `retired_at` non null (commande remise au client).
--   - Si toutes les bornes sont prises → fallback 'OVERFLOW' (toast staff).
--   - Idempotent : `if not exists` partout, fonction `create or replace`.
-- =====================================================================

-- ── 1. Colonnes commandes_drive ─────────────────────────────────────
alter table public.commandes_drive
  add column if not exists bay_label text,
  add column if not exists pret_at timestamptz,
  add column if not exists retired_at timestamptz;

-- Index : pickup screen filtre sur statut='pret' AND retired_at IS NULL.
-- Composé partiel pour rester compact (12 bornes max actives).
create index if not exists idx_commandes_drive_pret_bay
  on public.commandes_drive(bay_label)
  where statut = 'pret' and retired_at is null;

-- ── 2. Fonction assign_next_bay ─────────────────────────────────────
-- Renvoie la prochaine borne libre dans A1..A6 puis B1..B6.
-- Side-effects :
--   - update commandes_drive.bay_label, pret_at = now()
--   - statut PAS modifié ici (le caller fait setCommandeStatut('pret'))
--     pour permettre rollback indépendant.
create or replace function public.assign_next_bay(p_commande_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bay text;
  v_used text[];
begin
  -- Liste des bornes actuellement occupées (commandes prêtes non retirées).
  select coalesce(array_agg(bay_label), array[]::text[]) into v_used
  from public.commandes_drive
  where statut = 'pret'
    and retired_at is null
    and bay_label is not null;

  -- Cherche la première borne libre dans l'ordre A1..A6, B1..B6.
  for v_bay in
    select b from unnest(array[
      'A1','A2','A3','A4','A5','A6',
      'B1','B2','B3','B4','B5','B6'
    ]) as b
  loop
    if not (v_bay = any(v_used)) then
      update public.commandes_drive
        set bay_label = v_bay,
            pret_at = now()
        where id = p_commande_id;
      return v_bay;
    end if;
  end loop;

  -- Aucune borne libre → fallback OVERFLOW (commande au sol / sur chariot).
  update public.commandes_drive
    set bay_label = 'OVERFLOW',
        pret_at = now()
    where id = p_commande_id;
  return 'OVERFLOW';
end;
$$;

-- Permissions : appelé depuis le client v2 (anon) via supabase-js .rpc().
-- RLS sur la table reste permissive (cf. 0007_write_policies).
grant execute on function public.assign_next_bay(uuid) to anon, authenticated;
