# DEMO_BRIEF — RDV client du 10 juin 2026

> Mis à jour le 2026-05-15. À relire la veille du RDV.

---

## État des modules

| Module | Statut | Couverture | Risque démo |
|---|---|---|---|
| **Drive Particulier** (B2C) | 🟢 Production stable | 100% — en service depuis l'été 2024 | Faible. Tester juste un panier→checkout avant le RDV pour parer un éventuel bug Stripe. |
| **Labo** (recettes BOM, productions, marges) | 🟢 Frontend complet, DB seedée, RLS fixée | 8 routes, hooks typés, workflow guidé, dashboard Recharts | Faible. Vue `v_productions_kpi` opérationnelle, marges affichées. |
| **Drive Pro** (B2B) | 🟢 Frontend complet, DB seedée, RLS OK | 7 routes publiques + 3 admin, PDF facture, panier multi-TVA | Moyen. Validation manager > 500€ démontrable. PDF lourd (1,4 Mo) → léger délai au premier clic Télécharger. |

---

## Parcours de démo (45 min)

> Tester la veille en condition réelle (mobile + desktop). Faire toutes les
> connexions/déconnexions à l'avance pour éviter les surprises Auth pendant
> le RDV.

### Étape 1 — Drive Particulier (10 min) — parcours client

Sert à poser le décor et rappeler que c'est **ce qui marche déjà depuis 18 mois**, avant d'enchaîner sur le nouveau.

| # | URL | À montrer |
|---|---|---|
| 1 | `/` | Home avec hero photo, catégories, sélection éditoriale |
| 2 | `/produit/<id>` | Fiche produit (sur un produit boucherie pour la transition) |
| 3 | `/panier` | Ajout au panier, calcul total |
| 4 | `/creneaux` | Choix d'un créneau de retrait |
| 5 | `/connexion` puis `/paiement` | (sans confirmer le paiement) — montre que Stripe est intégré |

**Phrases clés** :
- *« Le Drive Particulier, c'est notre fondation : 18 mois en prod, des milliers de commandes traitées, le boucher l'utilise tous les jours. »*
- *« Mobile-first, PWA installable, paiement Stripe + retrait magasin en 5 min. »*
- *« Tout ce qu'on va voir après s'appuie sur cette même base technique. »*

### Étape 2 — Labo (15 min) — parcours boucher

C'est le **money shot Ahmed**. Pré-connexion en `admin` ou `employee` (compte test : `digitalwebmastertlse@gmail.com`).

| # | URL | À montrer |
|---|---|---|
| 1 | `/v2/labo` | Landing : 3 stats live (recettes actives, productions en cours, marge HT 30j) + 3 grosses cards |
| 2 | `/v2/labo/recettes` | Liste avec marge moyenne 30j par recette (vert/orange/rouge) |
| 3 | `/v2/labo/recettes/<id-merguez>` | Détail Merguez Salam Maison : 3 cards coûts + ingrédients + 6 étapes + main d'œuvre |
| 4 | `/v2/labo/productions` | Liste filtrable des 5 lots terminés |
| 5 | `/v2/labo/productions/<id>` | Récap KPI temps réel (marge €/%, rendement) sur un lot Merguez |
| 6 | `/v2/labo/marges` | Dashboard Recharts : line marge/jour + bar top recettes |

**Phrases clés** :
- *« Le boucher saisit sa recette une fois, et chaque production lui dit en temps réel sa marge réelle vs théorique. Plus de calcul mental, plus d'Excel. »*
- *« Les 4 KPI critiques (coût total, CA potentiel HT, marge HT €/%, rendement) sont calculés en SQL via une vue agrégée — aucun risque de désynchronisation. »*
- *« En 30 jours d'historique, on voit déjà quelles recettes tirent la marge et lesquelles plombent — décisions chiffrées, pas instinctives. »*

### Étape 3 — Drive Pro (15 min) — parcours admin

Le **levier de croissance B2B**. Pré-connexion en `admin`.

| # | URL | À montrer |
|---|---|---|
| 1 | `/pro/inscription` | Form 3 étapes (entreprise → délégué → validation), sans soumettre |
| 2 | `/pro/login` | Mention "Compte en attente" possible (École Mansour seedée en `en_validation`) |
| 3 | `/admin/comptes-pro` | Table des 5 comptes Pro, École Mansour avec bouton **Valider** |
| 4 | `/pro/catalogue` (en tant que délégué) | Grille produits viande avec prix HT + paliers dégressifs (-5% à 10 cartons, -10% à 30) |
| 5 | `/pro/panier` | Calcul HT/TVA/TTC live multi-taux (5,5% viande + 20% épicerie) |
| 6 | `/admin/commandes-pro` | Table 6 commandes ; commande Carthage > 500€ avec badge **Validation manager requise** |
| 7 | `/pro/commande/<id-bosphore-payée>` | Récap + bouton **Télécharger facture PDF** (génération A4) |
| 8 | `/admin/factures-pro` | Relances : École Mansour J-35 en retard, bouton **Marquer payée** |

**Phrases clés** :
- *« On parle français : SIRET, mandat SEPA, validation manager au-delà de 500€, conditions 30 jours / fin de mois. Pas un module "B2B universal" qui ignore les usages locaux. »*
- *« Le client Pro a son tunnel séparé : palette anthracite + or, prix HT, dégressifs volume. Le client Particulier ne voit jamais ces tarifs. »*
- *« Génération de facture PDF intégrée, numérotation atomique côté DB (CP-2026-XXXX et F-2026-XXXX), encours plafond surveillé en temps réel. »*

### Étape 4 — Q&A et roadmap (5 min)

---

## Données de démo en base

### Comptes de connexion

| Email | Mot de passe | Rôle | Usage démo |
|---|---|---|---|
| `digitalwebmastertlse@gmail.com` | (à toi) | `admin` | Démo des écrans admin et labo |
| `zbairi.mohamed@salamarket31.fr` | (à toi) | `manager` | Optionnel — montre que validation > 500€ est gérée par manager |
| `mohamed.zbairi@salamarket31.fr` | (à toi) | `manager` | Doublon historique (à archiver post-démo, l'un des deux) |

Pour la démo client Pro : les 5 délégués sont seedés sans `delegue_user_id` (impossible de créer des `auth.users` en SQL pur). Si tu veux pouvoir te connecter en tant que délégué Bosphore par exemple, il faudra créer l'auth user manuellement via Dashboard Supabase puis :
```sql
update comptes_pro set delegue_user_id = (select id from auth.users where email = 'contact@lebosphore31.fr')
 where siret = '79347 821 600 015';
```

### 5 comptes Pro (table `comptes_pro`)

| Raison sociale | Statut | Conditions paiement | Encours max | Pour la démo |
|---|---|---|---|---|
| Restaurant Le Bosphore | `actif` | 30 jours | 3000€ | 2 commandes ; une payée + facture PDF dispo |
| Traiteur Halal Toulouse | `actif` | comptant | 1500€ | 1 commande en préparation |
| Association Mosquée Empalot | `actif` | 30 jours | 800€ | 1 livrée non payée |
| École Mansour Hadj | **`en_validation`** | 45 jours fin de mois | 2500€ | Démo de validation manager |
| Pizzeria Le Carthage | `actif` | comptant | 1000€ | 1 commande `a_valider` > 500€ |

### 6 commandes Pro

- 1 Bosphore J-20 → `payee` (PDF facture téléchargeable)
- 1 Bosphore J-2 → `en_preparation`
- 1 Traiteur Halal J-5 → `en_preparation`
- 1 Mosquée Empalot J-15 → `livree` non payée
- 1 École Mansour J-35 → `facturee`, **date échéance dépassée** (relance)
- 1 Pizzeria Carthage J-1 → `a_valider`, ~926€ HT (validation manager)

### 3 recettes (table `recettes`, statut `active`)

| Recette | Catégorie | Ingrédients | Étapes | Main d'œuvre |
|---|---|---|---|---|
| Merguez Salam Maison | viande | 6 | 6 | 2 (Boucher 2h + Préparateur 30min) |
| Kefta Agneau | viande | 6 | 4 | 2 |
| Brochettes Poulet Marinées | volaille | 6 | 4 | 1 |

### 5 productions terminées (table `productions`, statut `terminee`)

| Lot | Recette | Date | Rendement |
|---|---|---|---|
| L2026-0420-MER-001 | Merguez | J-25 | 88 % |
| L2026-0503-MER-002 | Merguez | J-12 | 92 % |
| L2026-0512-MER-003 | Merguez | J-3 | 95 % |
| L2026-0427-KEF-001 | Kefta | J-18 | 91 % |
| L2026-0508-BRO-001 | Brochettes | J-7 | 89 % |

→ Toutes apparaissent dans `v_productions_kpi` avec marge HT calculée. Visualisable dans `/v2/labo/marges`.

---

## TODO post-démo (bugs connus mineurs)

### Priorité 1 — Avant production

- [ ] **Types Supabase à régénérer** via `supabase gen types` dès que l'accès CLI sera accordé. Les types actuels sont hand-written et alignés sur la DDL réelle inspectée, mais ce n'est pas la source de vérité officielle.
- [ ] **Comptes auth des 5 délégués Pro** à créer manuellement et lier via UPDATE `comptes_pro.delegue_user_id`. Sans ça, les comptes Pro existent mais aucun délégué ne peut se connecter pour passer commande lui-même.
- [ ] **Mismatch #1 fixé** ✅ (commit `a2e36e8`) — `type_recuperation: 'drive'` → `'retrait_pro'` dans `Panier.tsx`.

### Priorité 2 — Polish

- [ ] **`statut` recettes/productions** : valeurs anglaises pour recettes (`draft/active/archived`) cohabitent avec valeurs françaises pour productions (`en_cours/terminee`). À harmoniser une fois la CHECK constraint vérifiée via `pg_get_constraintdef`. Le `STATUT_VARIANTS` map de `Recettes.tsx` a encore des clés FR mortes (`brouillon`, `archivee`) — cosmétique, badges tombent en variant `outline` par défaut.
- [ ] **Photo lot de production** : la colonne `productions.photo_url` n'existe pas en DB → la fonctionnalité a été retirée du workflow. Si tu veux la rétablir, prévoir `ALTER TABLE productions ADD COLUMN photo_url text` + réactiver la step Photo dans `ProductionNouvelle.tsx` (~30 min).
- [ ] **Marge unitaire théorique par recette** : retirée parce que `recettes.prix_vente_ttc_unitaire` n'existe pas en DB. La marge réelle reste calculée par production via `v_productions_kpi`. Si on veut une marge prédictive sur la fiche recette, prévoir une colonne dédiée ou un calcul basé sur la moyenne des dernières productions.
- [ ] **Doublon Zbairi** : 2 comptes `manager` (`zbairi.mohamed@…` et `mohamed.zbairi@…`). Archiver celui qu'il n'utilise plus.
- [ ] **`seed_labo.sql`** : a été écrit avant le réalignement DDL, ses colonnes ne matchent plus le schéma réel. À régénérer ou supprimer (les seeds actuelles ont été appliquées manuellement, ce fichier est obsolète).

### Priorité 3 — Performance

- [ ] **Chunk InvoicePDF 1,4 Mo** (491 Ko gzipped). Acceptable car lazy mais ressenti au premier clic Télécharger. Alternative légère : `pdfmake` ou rendu côté serveur via une edge function Supabase. Pas bloquant pour la démo.
- [ ] **Erreur tsc pré-existante** dans `useEmployeeOrders.ts:72` (cast `Json` → `OrderItem[]`). Hors scope nuit du 14-15 mai mais reste dans `npx tsc --noEmit`. À nettoyer.
- [ ] **Lint** : 7 erreurs + 8 warnings dans du code pré-existant (cf. AUDIT_REPORT.md). Hors scope démo.

### Priorité 4 — RLS sécurité (post-démo)

Les policies RLS Labo sont actuellement en mode permissif (`for all using true`) pour `authenticated`. À durcir vers une matrice par rôle :
- `admin/manager/employee` peuvent SELECT/INSERT/UPDATE sur les tables Labo
- `customer` (clients Drive Particulier) n'accède à rien des tables Labo

Option C documentée dans `DIAGNOSTIC_RECETTES.md` ; ~15 lignes de SQL.

---

## Checklist veille du RDV (à faire le 9 juin)

- [ ] Re-tester l'intégralité du parcours sur prod (URL exacte du domaine, pas localhost)
- [ ] Re-créer le 5e compte délégué Pro si tu veux que la démo « connexion délégué Bosphore » soit fluide
- [ ] Vérifier les certifs HTTPS, le DNS, le PWA install prompt
- [ ] Recharger le seed si la base a été touchée entre temps (`seed_drive_pro.sql` est idempotent ; le `seed_labo.sql` est obsolète, on a les données seedées manuellement)
- [ ] Mettre le projet en mode "lecture seule" côté équipe pour pas que quelqu'un push pendant la démo
- [ ] Café et caméra Loom prête au cas où le RDV se fait à distance

Bon RDV.
