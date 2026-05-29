# Stock — "Otmane Impress" Demo Spec (June 10, 2026)

> **Date :** 2026-05-30 (T-10)
> **Auteur :** Head of Product (synthèse 6 research reports)
> **Audience :** Otmane Jamal (manager K&A FOOD Toulouse, bras droit Ahmed NASRY)
> **Mission :** une démo de 20 min qui fait dire à Otmane "personne d'autre n'a ça, je le veux demain"
> **Budget :** 20 dev-days (2 devs × 10 jours), partagé sur 4–6 features
> **Hors scope :** DA port Drive→Stock, QR lot trace L2026-05-A23, DLC engine, pickup screen, bay label (déjà en parallèle)

---

## 1. Vision en un paragraphe

Stock devient le **système nerveux halal** que Cashmag n'a jamais voulu être. Pendant que la caisse encaisse, Stock *anticipe* — l'algo lit le calendrier hijri, prédit les ruptures J+7 avec la double exponentielle de Holt, drafte la commande à Sodrune avant qu'Otmane n'y pense, bloque la commande si le certif AVS du fournisseur a expiré, et lui sert un cockpit iPhone-first à 8h05 qui répond à *la* seule question qu'il se pose chaque matin : *"qu'est-ce que je dois faire aujourd'hui ?"*. Aucun POS halal FR (Aya Market inclus) ne raisonne en hijri, ne bloque sur un cert périmé, ni ne montre la masse salariale vs CA en temps réel. C'est notre moat catégoriel et notre cadeau de bienvenue à Otmane.

---

## 2. La règle du jeu : Wow × Effort efficiency

Sur les 6 domaines de research, on a 4–6 slots et 20 dev-days. Critères de tri :

1. **Wow Otmane (1–5)** — est-ce qu'il a un "ah ouais" visible ? Pas de wow théorique invisible.
2. **Démonstrable en 30s** — si on doit l'expliquer plus, on perd la salle.
3. **Halal-spécifique** — ce que Cashmag/Lightspeed/Combo ne peuvent PAS copier vite.
4. **Effort réaliste** — base de code existante (migrations 0001–0033, push_subscriptions déjà OK, `produits_lots` déjà OK).

Filtrage :

| Domaine research | Wow | Démo | Halal | Effort estimé | Verdict |
|---|---|---|---|---|---|
| 1. Predictive stockout (Holt + hijri) | 5 | OUI | OUI (hijri) | 4 j | **SHIP** |
| 2. Auto-PO + cert halal block | 5 | OUI | OUI (AVS) | 5 j | **SHIP** |
| 3. Scanner-first BDL | 4 | OUI | OUI (lot AVS) | 4 j | **SHIP** |
| 4. Casse intelligence (z-score + heatmap) | 3 | OUI | partiel | 3 j | **SHIP léger** |
| 5. Manager cockpit (hero + 4 alert cards) | 5 | OUI | OUI (hijri/Aya) | 3 j | **SHIP** |
| 6. Staff planning + pointage PIN | 4 | OUI | OUI (Ramadan) | 6 j | **SHIP réduit (kiosk only)** |

Total : 25 j si tout pris. On coupe : casse intelligence livrée en *version weekly digest mail uniquement* (1 j au lieu de 3), staff planning livré en *kiosk pointage + bandeau live* (3 j au lieu de 6, planning drag-drop reporté Phase 1). **Total shippé : 20 j pile.**

---

## 3. Les 6 features démo-shippables (ordre de priorité démo)

### F1 — Manager Cockpit "Sabah el khir Otmane" (3 j)

**Pourquoi c'est le hero de la démo.** C'est l'écran qu'Otmane verra **chaque matin à 8h05** en marchant dans le dépôt. Si on rate ça, le reste est un dashboard de plus. On vise un thumb-scroll = 30 secondes = "je sais quoi faire aujourd'hui".

**Architecture (top → bottom, iPhone-first, sticky 64px) :**
- Status bar : "Sabah el khir Otmane · 12 Rajab 1447 · Ramadan dans 28 j · 23°"
- Hero KPI 56px : ventes hier vs target + delta N-1 + spark 30 j
- Grille 2×2 alert cards (DLC J-1, ruptures imminentes, casse anormale, drive backlog) — chaque card → drawer action
- Bandeau "Today ops" : staff présent, livraisons attendues
- Ramadan card (conditionnelle T-30 → Aïd+7)
- Carte compétiteur Aya Market (manuel + edge fn nightly)

**Schema deltas (0034_cockpit_views.sql) :**
```sql
create materialized view mv_ventes_quotidiennes as
  select date_trunc('day', created_at) as date, depot_id,
         sum(ttc) as ca_ttc, count(*) as nb_tickets
  from ventes_cashmag_import group by 1, 2;

create table cockpit_targets (
  depot_id uuid references depots(id),
  date_jour date,
  target_ca numeric(10,2),
  primary key (depot_id, date_jour)
);

create table competitor_intel (
  id uuid primary key default gen_random_uuid(),
  competitor text not null default 'aya_market',
  observed_at timestamptz default now(),
  category text, sku_label text, prix_observe numeric(8,2),
  source text check (source in ('photo_employee','scrape','manual')),
  photo_url text
);

create table hijri_events (
  id uuid primary key default gen_random_uuid(),
  event_code text check (event_code in ('ramadan_start','ramadan_end','aid_fitr','aid_adha','achoura')),
  gregorian_date date not null,
  hijri_year int, hijri_month int, hijri_day int
);
-- Seed Ramadan 2026 (Feb 17 → Mar 18 2027 for 1447 AH)
```

**Frontend :**
- `apps/stock/app/v2/cockpit/page.tsx` (page principale, SSR + realtime Supabase channel)
- `apps/stock/components/cockpit/hero-kpi.tsx`
- `apps/stock/components/cockpit/alert-card.tsx` (4 variantes)
- `apps/stock/components/cockpit/ramadan-card.tsx` (conditionnelle)
- `apps/stock/components/cockpit/competitor-card.tsx`
- `apps/stock/lib/hijri.ts` (table dates 2026–2030 hardcodée, pas de lib externe)

**Backend :**
- `apps/stock/app/api/cockpit/snapshot/route.ts` (un seul endpoint qui agrège les 6 zones)
- `supabase/functions/refresh-cockpit-cache/index.ts` (cron 02:00 rebuild materialized view)

**Demo moment (30s) :** Otmane ouvre l'app sur son iPhone à 8h05. *"Salut Otmane, Ramadan dans 28 jours. T'as fait 38 420 € hier, +12% sur N-1. Trois trucs aujourd'hui : 14 réfs en DLC J-1 (287 €), 8 SKU qui vont taper rupture, et la casse a fait +47% hier soir sur la boucherie. Tap pour creuser."*

---

### F2 — Predictive Stockout + Hijri Forecast (4 j)

**Pourquoi.** C'est le moteur invisible qui alimente F1 (alert ruptures) et F3 (auto-PO). Sans lui, le reste est cosmétique. Le wow se révèle quand on dit "regarde, à J-60 du Ramadan, ton stock dattes est déjà gonflé automatiquement".

**Modèle (cf. research #1) :**
- **Holt double exponential smoothing** par (product_id, depot_id), α=0.35 β=0.10
- Multiplicatif : `velocity_adj = (level + trend) × S_dow × S_hijri × S_promo`
- 5 tiers de coverage : OK / Warning / Critical / Blocker / Stockout
- Multi-depot consolidation (Sodrune → Particulier transfer avant PO)

**Hijri demand curve seedée (la table magique) :**
| Phase | J offset | Multiplier | Categories |
|---|---|---|---|
| Pre-Ramadan | -60 à -30 | 1.15 | dattes, farine, lait |
| Ramadan ramp | -30 à -1 | 1.40 | tout sec + viande |
| Ramadan daily | 0 à +29 | 1.25 (1.6 iftar) | iftar items |
| Aïd al-Fitr | +27 à +30 | 2.20 | mouton, pâtisserie |
| Aïd al-Adha | DH-7 à DH+2 | 3.50 | agneau frais |
| Achoura | Muharram 9-10 | 1.30 | viande, semoule |

**Schema deltas (0035_velocity_state.sql) :**
```sql
create table velocity_state (
  product_id uuid, depot_id uuid,
  level numeric(10,3), trend numeric(10,3),
  last_sales numeric(10,3), updated_at timestamptz default now(),
  primary key (product_id, depot_id)
);

create table hijri_demand_curve (
  category_id uuid, phase_code text,
  days_offset_start int, days_offset_end int,
  multiplier numeric(4,2),
  primary key (category_id, phase_code)
);

create table stockout_forecast (
  product_id uuid, depot_id uuid,
  velocity_adj numeric(10,3), days_cover numeric(6,2),
  tier text check (tier in ('ok','warn','crit','blocker','out')),
  computed_at timestamptz default now(),
  primary key (product_id, depot_id)
);
create index idx_forecast_tier on stockout_forecast(tier) where tier in ('crit','blocker','out');
```

**Frontend :**
- `apps/stock/app/v2/forecast/page.tsx` (tableau filtré par tier, lien vers PO)
- Integration card F1 "Ruptures imminentes" → consomme `stockout_forecast`

**Backend :**
- `supabase/functions/forecast-stockouts/index.ts` (cron hourly 06:00–22:00, every 15 min during Ramadan iftar window)
- `apps/stock/app/api/forecast/recompute/route.ts` (force recompute pour un product_id, dev/demo)

**Demo moment (30s) :** Otmane ouvre `/v2/forecast`. *"Regarde — dans 28 jours c'est Ramadan. L'algo a déjà mis tes dattes Medjool en alerte (3.2 jours de stock, target 8). Il a vu Ramadan dans le calendrier hijri, multiplié ta vitesse par 1.15, et il te dit `commande 4 cartons demain`. Aya Market n'a pas ça."*

---

### F3 — Auto-PO + Halal Cert Block (5 j)

**Pourquoi c'est le coup de massue.** C'est le seul moment de la démo où Otmane verra **un truc impossible chez Aya Market** : un PO auto-généré qui se **bloque** parce que le certif ARGML du fournisseur a expiré 12 jours plus tôt. Pure moat halal.

**Workflow :**
1. Cron quotidien 06:00 lit `stockout_forecast` (issu de F2)
2. Groupe par (fournisseur, dépôt) → respecte `min_commande_euros`, top-up avec fast-movers si seuil pas atteint
3. Vérifie `fournisseurs.certif_expire_le > now()` → sinon swap to backup supplier OU flag rouge
4. Génère PDF (jsPDF déjà au repo), email via Resend (existant), insert `confirme_par_token` pour one-click confirm
5. Push notif Otmane : "3 commandes prêtes à valider"

**Schema deltas (0036_fournisseurs_struct_po.sql) :**
```sql
-- Upgrade fournisseur free-text → structured
alter table fournisseurs
  add column if not exists email_commandes text,
  add column if not exists lead_time_jours int default 2,
  add column if not exists min_commande_euros numeric(10,2) default 0,
  add column if not exists franco_de_port_euros numeric(10,2),
  add column if not exists jours_livraison int[] default '{1,2,3,4,5}',
  add column if not exists certif_organisme text check (certif_organisme in ('AVS','ARGML','ACMIF','SFCVH','MOSQUEE_PARIS','AUTRE','NON_APPLICABLE')),
  add column if not exists certif_numero text,
  add column if not exists certif_expire_le date,
  add column if not exists certif_pdf_url text,
  add column if not exists actif boolean default true;

create table produits_fournisseurs (
  produit_id uuid references produits(id) on delete cascade,
  fournisseur_id uuid references fournisseurs(id),
  reference_fournisseur text,
  prix_achat_ht numeric(10,4) not null,
  conditionnement int default 1,
  est_principal boolean default false,
  primary key (produit_id, fournisseur_id)
);
create unique index one_primary_per_sku on produits_fournisseurs(produit_id) where est_principal;

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  fournisseur_id uuid references fournisseurs(id),
  depot_id uuid references depots(id),
  statut text default 'brouillon' check (statut in ('brouillon','envoyee','confirmee','partiellement_recue','recue','cloturee','annulee')),
  source text check (source in ('auto_stockout','auto_dlc','auto_ramadan','manuel')),
  declenche_par jsonb,
  date_envoi timestamptz, date_livraison_prevue date, date_livraison_confirmee date,
  total_ht numeric(12,2), pdf_url text,
  confirme_par_token text,
  cree_par uuid, created_at timestamptz default now()
);

create table purchase_order_lignes (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id) on delete cascade,
  produit_id uuid references produits(id),
  qte_commandee numeric(10,2) not null,
  qte_confirmee numeric(10,2), qte_recue numeric(10,2) default 0,
  prix_ht_unitaire numeric(10,4) not null,
  motif_suggestion text
);
```

**Frontend :**
- `apps/stock/app/v2/po/page.tsx` (dashboard widget "POs à valider", drawer pas modal)
- `apps/stock/app/v2/po/[id]/page.tsx` (édition ligne + envoi)
- `apps/stock/app/po/confirm/[token]/page.tsx` (public, mobile, no auth pour grossiste)
- `apps/stock/app/v2/fournisseurs/page.tsx` (admin certifs halal)
- `apps/stock/components/po/cert-halal-badge.tsx` (vert / orange J-30 / rouge expiré)

**Backend :**
- `supabase/functions/auto-generate-pos/index.ts` (cron daily 06:00 Europe/Paris)
- `apps/stock/app/api/po/send/route.ts` (PDF + email Resend + token)
- `apps/stock/app/api/po/confirm/route.ts` (public, token-based, ORDRSP-like reply)
- `apps/stock/app/api/po/[id]/match-bdl/route.ts` (link to F4 réception flow)

**Demo moment (30s) :** Otmane ouvre l'écran POs. *"L'algo t'a préparé 3 commandes. Celle de Reghalal — regarde, le badge est rouge. Le certif ARGML a expiré le 18 mai. La commande est bloquée, et il a déjà préparé la version backup chez SFCVH. Tu valides en deux taps, le grossiste reçoit l'email avec un bouton vert, il confirme en 1 clic depuis son téléphone. T'as plus jamais à passer une commande à la main."*

---

### F4 — Scanner-First BDL Réception (4 j)

**Pourquoi.** K&A reçoit 60–120 cartons/jour de Sodrune. Le réceptionnaire passe 45 min à cocher des cases. Scanner-first + IA + photo palette = 15 min + zéro erreur + lot AVS capturé automatiquement.

**Workflow refondu (`/v2/reception/[bdl_id]`) :**
1. Préamble obligatoire : photo palette + photo BDL + température sonde (sinon "Commencer scan" disabled)
2. Scan EAN carton → resolve `codes_barres_cartons` → auto-fill `quantite_recue`, bip vert/orange/rouge
3. Lot capture inline (OCR Claude vision sur étiquette, fallback 2 champs)
4. Fin scan → écart auto-calculé, statut ligne `recu|manquant|surplus`
5. Sign-off 3-step : réceptionnaire (PIN) → manager (push si écart >2%) → comptable (email auto)

**Schema deltas (0037_bdl_scan_first.sql) :**
```sql
alter table bons_de_livraison
  add column if not exists temperature_reception_c numeric,
  add column if not exists temperature_seuil_max_c numeric default 4,
  add column if not exists ecart_valeur_eur numeric default 0,
  add column if not exists valide_par_comptable uuid references employes(id),
  add column if not exists comptable_valide_le timestamptz;

alter table bons_de_livraison_lignes
  add column if not exists lot_id text references produits_lots(id),
  add column if not exists nb_cartons_scannes int default 0,
  add column if not exists ecart_qte int generated always as (quantite_recue - quantite_attendue) stored,
  add column if not exists scan_timeline jsonb default '[]'::jsonb;

create index idx_bdl_lignes_ecart on bons_de_livraison_lignes(bdl_id)
  where (quantite_recue <> quantite_attendue);
```

**Frontend (refonte existant) :**
- `apps/stock/app/v2/reception/[id]/page.tsx` (refactor — header sticky, préamble cards, scanner overlay full-screen via BarcodeDetector API)
- `apps/stock/components/reception/scanner-overlay.tsx`
- `apps/stock/components/reception/temperature-input.tsx` (Bluetooth Web API, fallback manuel)
- `apps/stock/components/reception/sign-off-modal.tsx` (PIN entry)

**Backend :**
- `apps/stock/app/api/bdl/scan-carton/route.ts` (resolve EAN + write ligne + push si écart, update `scan_timeline`)
- `apps/stock/app/api/bdl/finalize/route.ts` (calcule écart, écrit `ecart_valeur_eur`, trigger push manager si > 2%)
- Étend `apps/stock/app/api/cashbox/bon-reception-pdf/route.ts` (section écart + QR lots par ligne)

**Demo moment (30s) :** Otmane filme. Réceptionnaire scanne 5 cartons agneau Sodrune en 20 secondes → 4 bips verts, 1 surplus orange → push instantané sur l'iPhone d'Otmane → il accepte depuis le canapé. *"Le comptable a le BR PDF avant que t'aies fini ton café. Et chaque ligne porte le lot AVS, scannable au QR. Aya Market scanne rien."*

---

### F5 — Staff Pointage PIN Kiosk + Bandeau Live (3 j)

**Pourquoi.** Otmane gère 16 FTE à la main (Excel + papier). On lui montre les 2 features qui résolvent 80% du problème en 3 j (le drag-drop planning attendra Phase 1). C'est tangible, daily-use, et l'effet "qui est là maintenant" est instantanément lisible.

**Scope réduit pour la démo :**
- Kiosk iPad pointage PIN à l'entrée de chaque dépôt
- Bandeau live "qui est là maintenant" sur cockpit F1
- PAS le drag-drop planning (Phase 1)
- PAS la masse salariale / CA (Phase 1, dépend de seed shifts)

**Schema deltas (0038_staff_pointage.sql) :**
```sql
create table shifts (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid references employes(id) on delete cascade,
  depot_id uuid references depots(id),
  date_jour date not null,
  heure_debut time not null, heure_fin time not null,
  role_jour text check (role_jour in ('reception','caisse','preparation','drive','manager','polyvalent')),
  pause_minutes int default 0, notes text,
  est_ramadan boolean default false,
  cree_par uuid references employes(id),
  created_at timestamptz default now()
);
create index idx_shifts_date_depot on shifts(date_jour, depot_id);

create table pointages (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid references employes(id),
  shift_id uuid references shifts(id),
  depot_id uuid references depots(id),
  check_in timestamptz not null,
  check_out timestamptz,
  pause_debut timestamptz, pause_fin timestamptz,
  device_id text,
  anomalie text check (anomalie in ('sans_planning','retard','depart_anticipe','oubli_pointage')),
  created_at timestamptz default now()
);
create index idx_pointages_ouvert on pointages(employe_id) where check_out is null;

alter table employes
  add column if not exists taux_horaire_brut numeric(6,2),
  add column if not exists contrat_heures_hebdo int default 35,
  add column if not exists observe_ramadan boolean default false;
```

**Frontend :**
- `apps/stock/app/pointage/page.tsx` (kiosk iPad, no auth, grille employés du dépôt + clavier PIN)
- `apps/stock/components/staff/live-strip.tsx` (consommé par cockpit F1 "Today ops")
- `apps/stock/app/v2/staff/live/page.tsx` (vue complète manager si tap depuis cockpit)

**Backend :**
- `apps/stock/app/api/pointage/route.ts` (POST {employe_id, pin, depot_id, action: in|pause_start|pause_end|out})
- Pas d'edge function — pure Next.js routes serveur

**Seed démo :**
- 16 employés K&A FOOD avec PIN + photo + `taux_horaire_brut` réaliste
- Shifts pré-chargés semaine 8–14 juin (pour rendre le bandeau live "habité")

**Demo moment (30s) :** Otmane pointe l'iPad du dépôt. Karim arrive, tap sa photo, PIN 4 chiffres, *bip* checked-in. Otmane regarde son cockpit, le bandeau live affiche `7/9 présents · Karim retard 12'`. *"Plus de feuille papier. Plus d'Excel. Et pendant Ramadan le mois prochain, les horaires se décaleront tout seuls pour ceux qui jeûnent — case observe_ramadan dans la fiche."*

---

### F6 — Casse Weekly Digest Email (1 j)

**Pourquoi.** Le dashboard complet (z-score + heatmap + 4-tier escalation) coûterait 3 j. On garde l'**effet wow** sans le coût : un email automatique le lundi 7h avec 3 actions concrètes + projection S+1. Cet email est ce qu'Otmane *garde* et *forward*. Le dashboard viendra Phase 1.

**Workflow :**
- Edge function cron `lundi 07:00 Europe/Paris`
- Calcule sur 7 jours glissants : casse € totale, delta vs S-1, top 3 produits, pic horaire dominant
- Détecte 3 actions concrètes (DLC courte au BDL, pic fin-shift, prévisionnel Ramadan)
- Email HTML via Resend → Otmane + Ahmed

**Schema deltas (0039_casse_baseline.sql) :**
```sql
create materialized view v_casse_baseline_28j as
  select product_id, depot_id,
         avg(qty_casse) as mu_28j,
         stddev_samp(qty_casse) as sigma_28j,
         percentile_cont(0.95) within group (order by qty_casse) as p95
  from sorties_stock
  where motif = 'casse' and created_at > now() - interval '28 days'
  group by product_id, depot_id;

create view v_casse_pic_horaire as
  select extract(hour from created_at) as heure,
         extract(dow from created_at) as jour,
         encode(digest(user_id::text, 'sha256'), 'hex') as user_id_hash,
         count(*) as nb_casses,
         sum(qty_casse * prix_achat) as valeur_perdue
  from sorties_stock
  where motif = 'casse' and created_at > now() - interval '90 days'
  group by 1, 2, 3
  having sum(qty_casse * prix_achat) > 50;
```

**Backend :**
- `supabase/functions/casse-weekly-digest/index.ts` (cron `0 7 * * 1`)
- Reuse `apps/stock/app/api/email/route.ts` (existant)
- Template HTML inline dans la edge function (pas de framework email)

**Frontend :** néant pour la démo (le dashboard arrive Phase 1).

**Demo moment (30s) :** Otmane montre sa boîte mail. *"Tous les lundis 7h, je reçois ça. 2 847 € de casse, -12% sur S-1, et 3 actions précises : ramener Sodrune sur le lot AVS-2451 (DLC trop courte), ajouter un check 17h45 sur la boucherie, et préparer le plan Ramadan. Je le forward à Ahmed et c'est ma réunion lundi matin réglée."*

---

## 4. Capacity check & sequencing

**Total budget :** 20 dev-days (2 devs × 10 j).

| Feature | Effort | Dev assignment | Dépendances |
|---|---|---|---|
| F1 Cockpit | 3 j | Dev A (J1–J3) | rien (peut commencer J1) |
| F2 Forecast Holt + hijri | 4 j | Dev A (J4–J7) | hijri_events seed |
| F3 Auto-PO + cert halal | 5 j | Dev B (J1–J5) | fournisseurs seed |
| F4 Scanner-first BDL | 4 j | Dev B (J6–J9) | F3 (link PO ↔ BDL) |
| F5 Pointage PIN kiosk | 3 j | Dev A (J8–J10) | rien |
| F6 Casse weekly digest | 1 j | Dev B (J10) | rien |
| **Total** | **20 j** | **OK** | — |

**J11 = demo dry-run.** J12 = seed prod data K&A FOOD pour démo crédible. J13 = démo June 10.

---

## 5. Roadmap Phase 1 / 2 / 3 (post-démo)

| Slug | Title | Reason deferred | Planned for |
|---|---|---|---|
| `casse-dashboard-full` | Dashboard casse avec z-score + heatmap + 4-tier escalation | F6 livre l'email, le dashboard arrive avec un design complet | Phase 1 — juillet 2026 |
| `staff-planning-dragdrop` | Drag-drop planning hebdo + KPI masse salariale/CA | Trop d'UX pour 3 j, mais l'infra `shifts` est prête | Phase 1 — juillet 2026 |
| `multi-depot-transfer-recommandation` | Suggestion transfert Sodrune → Particulier avant PO | Logique SQL prête (research #1 §4) mais UI = 2 j, pas critique demo | Phase 1 — juillet 2026 |
| `ordrsp-edifact-real` | EDI EDIFACT ORDRSP réel pour gros fournisseurs (Bigard, Reghalal) | Le mock one-click email suffit pour la démo, EDI réel = 10+ j et négo fournisseur | Phase 2 — septembre 2026 |
| `casse-anomalie-realtime-push` | Push critique L3 (z>3 ou >200€ sur 1 sortie) | Email weekly suffit pour démontrer la valeur, realtime = 2 j de plus | Phase 2 — septembre 2026 |
| `auditor-readonly-role` | Rôle auditeur AVS read-only avec masquage PII | Important pour la rétention mais 0 wow demo | Phase 2 — septembre 2026 |
| `forecast-ml-prophet` | Modèle Prophet/ARIMA en remplacement de Holt | Holt suffit pour démontrer hijri, ML = 3 sem | Phase 3 — Q4 2026 |
| `paie-export-dsn` | Export DSN + variables paie (Silae/PayFit/Sage) | Pas critique démo, demande compta-validation | Phase 3 — Q4 2026 |
| `congés-validation-workflow` | Demandes congé employé + validation manager | Phase 3 staff RH complète | Phase 3 — Q4 2026 |
| `geofencing-pointage` | Vérifier que iPad est bien dans le dépôt au check-in | Anti-fraude pointage, pas critique tier 1 | Phase 3 — Q4 2026 |
| `competitor-scrape-auto` | Scraper auto prix Aya Market (Instagram + site) | Le manuel + photo employée suffit demo, automation = legal review | Phase 3 — Q4 2026 |
| `inter-tenant-fed-pricing` | Pricing inter-SARL pour fédération Salamarket | Bet 10 ambition, ne shippe pas sur 1 SARL | Phase 3 — Q4 2026 |

---

## 6. Demo script (20 min Otmane)

| Min | Feature | Pitch |
|---|---|---|
| 0–2 | Intro | "Cashmag continue de gérer ta caisse. Stock orchestre par-dessus." |
| 2–5 | F1 Cockpit | "Tu ouvres l'app à 8h05, t'as ta journée en 30 secondes." |
| 5–9 | F2 Forecast | "L'algo lit le calendrier hijri, prédit tes ruptures J+7." |
| 9–14 | F3 Auto-PO + cert | "Il te drafte la commande, te bloque si le certif AVS du fournisseur a expiré." (← *le moment qui fait gagner le deal*) |
| 14–17 | F4 Scanner BDL | "5 cartons agneau Sodrune en 20 secondes, surplus poussé sur ton iPhone." |
| 17–19 | F5 Pointage + F6 Casse mail | "Tu sais qui est là maintenant, et lundi 7h tu reçois le rapport casse avec 3 actions." |
| 19–20 | Close | "Aya Market n'a rien de tout ça. Tu signes quand ?" |

---

## 7. WOW lines à mémoriser

- *"Aucun POS halal FR ne raisonne en hijri."*
- *"Aucun POS halal FR ne bloque sur un certif AVS périmé."*
- *"Aya Market à 200m ? Tu vois son prix poulet le matin, dans ton cockpit."*
- *"Pendant le Ramadan 1447, tes dattes Medjool sont commandées avant que tu y penses."*
- *"Le comptable a le BR PDF avant que t'aies fini ton café."*

---

## 8. Risks & mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Holt mal calibré → faux positifs ruptures | M | M | Seed avec 60 j d'historique Cashmag, expose α/β en admin pour tuner |
| Cert halal swap auto choisit mauvais backup | L | H | Demande confirmation Otmane avant envoi (modal "swap suggéré") |
| Scanner BarcodeDetector pas dispo iOS Safari | M | M | Fallback ZXing-js dans le bundle |
| Push notif iOS pas reçue (Safari ≤16.4) | L | M | Déjà géré par push_subscriptions, doc setup PWA pour Otmane J-1 |
| Démo wifi K&A FOOD lente | H | H | Cache cockpit en localStorage, mode "demo seed" offline-first |
| Otmane veut tout immédiatement post-demo | H | + | Roadmap Phase 1/2/3 prêt, signe contrat 18 mois |

---

**Prochaine étape :** validation Ahmed NASRY (gérant) sur le scope demo, puis kick-off J1 = 2026-05-31.
