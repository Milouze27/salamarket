-- ════════════════════════════════════════════════════════════════
-- Remove Mawlid (Mouloud) from hijri calendar
--
-- Mouloud (Mawlid an-Nabi, anniversaire du Prophète) n'est PAS un Eid.
-- Les SEULS Eids reconnus en Islam sont Eid al-Fitr et Eid al-Adha.
-- Mawlid est considéré comme bid'a (innovation) par certaines écoles
-- (salafi/wahhabi). Pour éviter de prendre parti dans une boucherie
-- halal qui sert toute la communauté musulmane (toutes écoles), on le
-- retire du calendrier hijri Salamarket.
--
-- Rajab est aussi retiré (pas d'impact CA halal mesurable).
--
-- NOTE : on NE DROP PAS les valeurs de l'enum hijri_event_type car
-- PostgreSQL ne supporte pas facilement ALTER TYPE DROP VALUE. Les
-- valeurs 'mouloud' et 'rajab' restent dans l'enum mais ne sont plus
-- jamais référencées par des lignes — c'est sans effet de bord.
-- ════════════════════════════════════════════════════════════════

delete from public.hijri_events where evenement = 'mouloud';
delete from public.hijri_events where evenement = 'rajab';

comment on type hijri_event_type is
  'Calendrier hijri Salamarket. Valeurs ''mouloud'' et ''rajab'' conservées '
  'dans l''enum pour backward compat mais ne doivent PAS être utilisées : '
  'audit 2026-05-31 — Mawlid n''est pas un Eid (controversé selon écoles), '
  'Rajab sans impact CA. Voir migration 20260531000010.';

notify pgrst, 'reload schema';
