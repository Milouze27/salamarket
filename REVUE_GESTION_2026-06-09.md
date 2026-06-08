# Revue app de gestion Salamarket — 73 constats

> 12 experts métier (marge, stock, achats, fiscal, décision) — vérifiés adversarialement.

**12 demo-critique · 39 forte-valeur · 22 confort**

Date : 2026-06-09


## DEMO-CRITIQUE

### stock_par_depot n'a pas de coût d'achat — marge produit incalculable (MAIS produits_fournisseurs.prix_achat_ht existe déjà)
- **Catégorie :** marge-rentabilite · **Effort :** M
- **Constat :** Le constat tient sur le fond : stock_par_depot ne porte que prix_vente, aucun coût (PMP/CMUP). On ne peut donc pas calculer une marge par produit à partir du stock. La valorisation admin (totalValue) est bien du CA potentiel, pas du coût. CE QUE L'EXPERT A MANQUÉ : un coût d'achat de référence EXISTE déjà au data model — table produits_fournisseurs(prix_achat_ht, est_principal), migration 20260530
- **Preuve :** SCHEMA.md stock_par_depot lignes 281-305 (id, produit_id, depot_id, quantite, prix_vente, is_visible, updated_at — zéro coût). supabase/migrations/20260530000005_purchase_orders.sql:47-67 (table produ
- **Pourquoi ça compte :** Un épicier pilote sur la marge brute, pas sur le CA. Sans coût, impossible de dire si un produit gagne ou perd de l'argent, d'arbitrer un prix, ou de répondre à Ahmed en démo « et ma marge ? ». Le coût de référence existant rend le manque encore plus
- **Reco :** 1. MVP rapide : exposer cout_ref_ht via produits_fournisseurs (est_principal=true) et l'utiliser pour marge et valorisation au coût. 2. Plus juste (étape 2) : ajouter prix_achat_pmp à stock_par_depot et le mettre à jour par réception (cf. constat finalize). 3. Documenter produits_fournisseurs dans S

### Réception (bdl/finalize) ne propage jamais le prix_achat_ht vers le stock — coût d'achat connu puis perdu
- **Catégorie :** coherence-workflow · **Effort :** M
- **Constat :** Vérifié dans le code : à la finalisation d'un BDL, on connaît prix_achat_ht ligne par ligne (on s'en sert même pour valoriser l'écart de réception en €), mais l'incrément de stock passe par la RPC adjust_stock qui ne reçoit QUE le delta de quantité — aucun paramètre de coût. Le prix d'achat réellement reçu n'est donc jamais persisté dans stock_par_depot. Résultat : à chaque réception le système TI
- **Preuve :** apps/stock/app/api/bdl/finalize/route.ts:136-153 — sb.rpc('adjust_stock', { p_produit_id, p_depot_id, p_delta: recu, p_type:'reception', p_lot_id, p_reference_id, p_actor_id }) : pas de coût. Le même 
- **Pourquoi ça compte :** C'est LE point où un PMP se construirait naturellement (entrée de stock = quantité + coût). Sans ce branchement, toute marge reste théorique et la valorisation au coût impossible, alors que la donnée transite déjà dans la requête. Effort réel faible 
- **Reco :** 1. Étendre adjust_stock (ou un wrapper) pour accepter p_cout_ht et recalculer stock_par_depot.prix_achat_pmp = (ancien_pmp×qte_avant + cout_recu×qte_recue)/(qte_avant+qte_recue) sur les réceptions. 2. À défaut de PMP, au moins écrire le dernier prix_achat_ht reçu. 3. Tester : 2 réceptions à coûts di

### Rapport mensuel = caisse, pas reporting : CA/TVA par canal sans COGS ni marge brute
- **Catégorie :** marge-rentabilite · **Effort :** M
- **Constat :** Vérifié : computeMonthlyReport produit ca_ttc/ca_ht/tva par canal (magasin/drive), frais Stripe, répartition, évolution — mais ZÉRO champ COGS ou marge brute. L'interface MonthlyReport ne contient aucun *_cogs/*_marge. La page /v2/admin/rapport-mensuel et /v2/admin/recap-fiscal ne mentionnent jamais 'marge' (grep vide). C'est un état de caisse, pas un compte de résultat. La réponse à « ai-je gagné
- **Preuve :** apps/stock/lib/cashbox/monthly-report.ts — interface MonthlyReport lignes 16-29 et objet retourné lignes 204-231 : aucun cogs/marge. Calculs lignes 84-149 = CA/TVA uniquement. grep 'marge|cogs' sur ra
- **Pourquoi ça compte :** Un rapport mensuel sans marge n'a pas de valeur de pilotage pour un gérant. Otmane/Ahmed reçoivent un chiffre d'affaires vide de sens sur la rentabilité. En démo, c'est exactement la question qui tombe et reste sans réponse.
- **Reco :** 1. Enrichir MonthlyReport avec cogs_drive (Σ quantite × cout_ref_ht via produits_fournisseurs/PMP) et marge_brute_eur/pct. 2. Magasin : COGS calculable seulement une fois cashmag relié au produit (cf. constat dédié) — l'indiquer comme partiel d'ici là plutôt que d'inventer un chiffre. 3. Ajouter ces

### Commandes Drive 100% unit (Checkout) passent en 'prêt' sans décrémenter le stock
- **Catégorie :** fiabilite-stock · **Effort :** M
- **Constat :** Confirmé, mais la preuve de l'expert était inexacte (il accusait le trigger sync). Le vrai chemin : dans la page de préparation, finalize() a DEUX branches. Branche 'autorise' (Drive au poids, Stripe pré-auth) → finalizePreparation(), qui décrémente TOUTES les lignes de la commande via adjust_stock. Branche legacy (statut_paiement !== 'autorise', soit les commandes 100% unit payées par Stripe Chec
- **Preuve :** apps/stock/app/v2/preparation/[id]/page.tsx:392 (branche statut_paiement==='autorise' → finalizePreparation) vs 431-440 (branche legacy → setCommandeStatut('pret') seul). lib/db/index.ts:1307-1322 : s
- **Pourquoi ça compte :** C'est le canal de vente le plus courant (épicerie sèche, conserves, produits emballés = 100% unit). Chaque commande Drive unitaire creuse un écart invisible entre stock théorique et physique. À la question 'on vend combien de couscous/jour', le systè
- **Reco :** Faire décrémenter le stock aussi dans la branche legacy : appeler finalizePreparation (ou une RPC dédiée) qui itère les lignes commandes_drive_lignes et adjust_stock(type='sortie', reference_id='drive:{cmd}:{ligne}'). Le code de décrément de finalizePreparation:237-287 est déjà générique (lignes uni

### date_echeance jamais calculée : toute la chaîne de relance impayés Pro est morte
- **Catégorie :** b2b-pro · **Effort :** M
- **Constat :** Le constat de l'expert est non seulement fondé mais sous-estimé. AUCUN code ne pose jamais date_echeance : setCommandeStatut (lib/db/pro.ts:219-237) ne pose que validee_par_profile_id/validee_at au passage 'validee', et rien au passage 'facturee'. marquerPayee ne touche que statut+date_paiement. Le trigger gen_facture_numero ne pose que facture_numero. Résultat : date_echeance reste TOUJOURS NULL 
- **Preuve :** /Users/mac/salamarket/apps/stock/lib/db/pro.ts:219-237 (setCommandeStatut ne pose jamais date_echeance) et :255-267 (estEnRetard/joursRetard dépendent de date_echeance) ; trigger gen_facture_numero _a
- **Pourquoi ça compte :** Pour un B2B à crédit, l'échéance est LE chiffre qui pilote la trésorerie. Sans elle, Ahmed ne sait jamais qui doit payer quand, aucune facture ne ressort 'en retard', et l'épicerie finance gratuitement ses clients pros. En démo, ouvrir une facture '4
- **Reco :** Au passage 'facturee' (ou 'validee' selon le choix métier), calculer date_echeance depuis comptes_pro.conditions_paiement : comptant = date_facture ; 30_jours = +30j ; 45_jours_fin_mois = fin du mois +45j. Le faire dans un trigger DB (même endroit que gen_facture_numero, idempotent) plutôt que côté 

### Cockpit snapshot filtre mv_ventes_quotidiennes par depot_id inexistant
- **Catégorie :** coherence-donnees · **Effort :** M
- **Constat :** Le snapshot cockpit filtre mv_ventes_quotidiennes (et ventes_n1) par depot_id quand un dépôt est fourni, mais cette colonne n'existe pas dans la MV : elle agrège uniquement par date_vente. Le filtre .eq('depot_id', ...) tape une colonne absente → Postgres/PostgREST renvoie une erreur → ventes_hier=null + warning 'MV inaccessible'. Le cockpit du matin d'Otmane affiche un CA vide dès qu'un dépôt est
- **Preuve :** snapshot/route.ts:202-203,206-207 (.eq('depot_id', depotId)) vs migration 20260530000003_cockpit_views.sql:113-125 (group by v.date_vente, SANS depot_id ; commentaire explicite l.106 'PAS de depot_id'
- **Pourquoi ça compte :** C'est l'écran d'ouverture quotidien du manager (Otmane). Si la sélection d'un dépôt vide le CA d'hier, le brief matinal est inutilisable et le patron perd confiance dès la première démo. Le filtre stockout/targets/casse par depot_id existe ailleurs, 
- **Reco :** Décision métier à trancher : soit la MV reste consolidée (un seul CA tous dépôts) et on RETIRE le .eq('depot_id') des requêtes mv_ventes_quotidiennes du snapshot ; soit on ajoute depot_id à ventes_cashmag_import + GROUP BY date_vente,depot_id dans la MV (nouvelle migration horodatée). Le plus simple

### Capture Stripe ne vérifie pas l'expiration de l'autorisation avant de capturer
- **Catégorie :** fiscal-conformite · **Effort :** S
- **Constat :** La route de capture Stripe charge la commande, vérifie statut_paiement='autorise', le montant autorisé, le PI — mais ne lit JAMAIS commandes_drive.autorisation_expire_at. Une autorisation Stripe expire après 7 jours ; au-delà, capture() lève une erreur Stripe et la commande reste capturable côté UI sans garde-fou temporel. Le code gère bien l'échec (return 500 + audit + statut non modifié), donc l
- **Preuve :** apps/stock/app/api/stripe/capture-payment/route.ts:84-204 — le SELECT (l.84) ne récupère pas autorisation_expire_at ; aucune vérification de date avant paymentIntents.capture (l.176). Colonne autorisa
- **Pourquoi ça compte :** Otmane pèse une commande Drive après plusieurs jours, la capture échoue, il ne sait pas pourquoi sans lire les logs. Une commande Drive 'au poids' restée trop longtemps non préparée devient non-encaissable silencieusement → perte sèche non tracée et 
- **Reco :** Récupérer autorisation_expire_at dans le SELECT et, si now() > expire_at, renvoyer une erreur explicite 'autorisation_expiree' AVANT l'appel Stripe (message actionnable pour le staff). Ajouter un cron qui flag/relance les commandes dont l'autorisation expire sous 24h.

### Page sortie staff refuse les décimales : impossible de déclarer une casse au poids (kg)
- **Catégorie :** anti-gaspi-dlc · **Effort :** S
- **Constat :** Le constat original visait l'absence de contrôle de cohérence sur la perte réelle. La vérification révèle un défaut PLUS GRAVE et prouvable : la page sortie parse la quantité avec parseInt(quantite,10) (sortie/page.tsx:172,312). Pour un produit AU POIDS (boucherie/volaille en kg : Merguez, Brochettes, Kefta), une casse de 0,3 kg ou 1,14 kg est soit refusée (parseInt('0.3')=0 → qte<=0 → 'Quantité i
- **Preuve :** sortie/page.tsx:172 const qte = parseInt(quantite,10) ; :173-176 rejet si qte<=0 ; :312 même parseInt dans canSubmit ; input type=number inputMode=numeric sans step (sortie/page.tsx:511-515) ; valoris
- **Pourquoi ça compte :** La boucherie/volaille halal fraîche est le cœur de métier et la casse la plus coûteuse. Si le staff ne peut pas déclarer '1,2 kg de merguez cassées', il déclarera 1 (sous-valorisé) ou rien. Le digest casse d'Otmane affiche alors une perte boucherie f
- **Reco :** Remplacer parseInt par parseFloat (avec virgule→point), ajouter step adapté (0.01 si produit unit_type='weight', 1 sinon), et libeller l'unité (kg vs pièce) selon produit.unit_type. Aligner la validation côté createSortie. Idéalement écran de pesée pour les produits au poids, mais le fix parseFloat 

### Remise DLC admin écrite dans stock_par_depot mais le Drive lit products.price_cents : divergence prix réelle
- **Catégorie :** anti-gaspi-dlc · **Effort :** M
- **Constat :** Le constat affirmait que le bouton 'Appliquer la remise' est un mock setTimeout : c'est FAUX, il est réellement implémenté (alertes-dlc/page.tsx:181-216 markdownProduit écrit prix_vente, prix_vente_avant_remise, remise_dlc_pct, demarque_at dans stock_par_depot, idempotent). MAIS le cœur du constat — la divergence — est CONFIRMÉ et même aggravé : la remise est écrite dans stock_par_depot.prix_vente
- **Preuve :** alertes-dlc/page.tsx:202-211 update stock_par_depot ; useProduct.ts:6,14,26 et useProducts.ts:9,20,32 lisent products.price_cents ; SCHEMA.md 'produits vs products' (deux tables physiques, pas de view
- **Pourquoi ça compte :** Otmane applique -30% en admin sur un produit DLC ; le client Drive ne voit jamais ce -30% (il voit soit le prix plein products.price_cents, soit la remise plancher du niveau, ex -40% critique). Le prix démarqué imprimé en rayon (printPromo lit stock_
- **Reco :** Une seule source de vérité prix. Option propre : exposer le prix effectif via une vue v_produits_prix_effectif (prix_vente_avant_remise × (1−remise_dlc_pct/100)) et faire lire le Drive depuis là (résout aussi la dette products vs produits). Option rapide : que markdownProduit écrive aussi products.p

### Aucune UI de gestion des employés (création/PIN/rôle) — onboarding staff impossible sans SQL
- **Catégorie :** onboarding-setup · **Effort :** M
- **Constat :** Vérifié et fondé. Aucune page de gestion d'équipe n'existe : la recherche de répertoires *employe*/*staff*/*equipe* sous apps/stock/app retourne ZÉRO résultat. La liste des routes /v2/admin (17 pages : alertes, commandes-pro, import-stock, pointage, recap-fiscal, etc.) ne contient aucune gestion d'employés. Il n'existe aucune API CRUD employés (grep insert/update employes dans app/api ne renvoie q
- **Preuve :** find apps/stock/app -iname '*employe*'/'*staff*'/'*equipe*' = vide ; routes /v2/admin/*/page.tsx = aucune page employes ; PINs seedés/tournés via supabase/migrations/20260531000024_rotate_pins.sql et 
- **Pourquoi ça compte :** Pour Ahmed, contrôler son équipe (ajouter un employé, révoquer un PIN d'un partant, changer un rôle) est une fonction de base d'un logiciel de gestion. Sans cette UI, l'app paraît incomplète en démo et crée une dépendance technique externe pour la mo
- **Reco :** Créer /v2/admin/equipe (CRUD employés) : créer (nom, prenom, role select reception/preparation/manager/admin, PIN 4 chiffres ou auto-généré + hashé via la fonction existante, depot_principal_id select), lister, désactiver (soft-delete is_active). Valider PIN unique + regex 4 digits. Réutiliser le ha

### Coût d'achat (prix_achat_ht) existe en table mais n'est ni saisissable en UI ni exploité — aucune marge ni valorisation de stock
- **Catégorie :** aide-decision-kpi · **Effort :** L
- **Constat :** Constat RÉAJUSTÉ : la prémisse de l'expert ('la structure existe en type mais PAS en table SQL') est FAUSSE. La table produits_fournisseurs EXISTE bien (migration 0036, ligne 52 : prix_achat_ht numeric(10,4)) avec un flag est_principal (un coût d'achat principal par produit) et est utilisée par api/po/auto-generate. Les lignes PO/BDL portent aussi prix_achat_ht. MAIS le vrai défaut tient : (1) AUC
- **Preuve :** supabase/migrations/20260530000005_purchase_orders.sql:47-64 (table produits_fournisseurs + prix_achat_ht + est_principal) ; grep est_principal/produits_fournisseurs dans apps/stock/app/v2 = 0 ; grep 
- **Pourquoi ça compte :** Sans marge ni valorisation au coût affichées, Ahmed ne peut pas piloter sa rentabilité ni décider de ses prix Drive. La donnée de coût EXISTE dans la DB mais reste invisible et non exploitable — c'est pire qu'absent car cela donne une fausse impressi
- **Reco :** 1. Exposer prix_achat_ht en UI : à la finalisation BDL/PO, écrire/mettre à jour produits_fournisseurs (est_principal). 2. Vue marge par produit (prix_drive_cents vs prix_achat_ht principal) dans /v2/admin ou cockpit. 3. KPI valorisation de stock au coût = SUM(quantite * prix_achat_ht principal) dans

### Coût d'achat non stocké — valorisation de stock affichée au prix de VENTE
- **Catégorie :** marge-rentabilite · **Effort :** L
- **Constat :** Aucun coût d'achat n'est rattaché au stock physique. `stock_par_depot` ne porte que `prix_vente`, et la table `produits` n'a AUCUNE colonne de coût (pas de prix_achat). Le dashboard admin valorise le stock par `quantite × prix_vente` et l'affiche sous le label générique « Valeur » (en or, KPI mis en avant). Ahmed lit donc une valeur de stock VENDU (CA potentiel), pas son capital immobilisé au coût
- **Preuve :** apps/stock/app/v2/admin/page.tsx:131 `totalValue: stock.reduce((s,p)=>s+p.quantite*(p.prix_vente??0),0)` affiché ligne 433 sous label "Valeur" (gold). SCHEMA.md:281-294 stock_par_depot = {quantite, pr
- **Pourquoi ça compte :** Pour un gérant d'épicerie, la valeur de stock au COÛT est le chiffre central de pilotage (capital immobilisé, trésorerie figée). Afficher 50 kg de viande à 1200€ (prix vente) au lieu de 600€ (coût) gonfle artificiellement la photo patrimoniale et emp
- **Reco :** Ajouter `cout_unitaire_moyen` (PMP) à `stock_par_depot`, alimenté à chaque réception depuis le prix d'achat HT des lignes PO/BDL. Au minimum: renommer le KPI admin « Valeur (au prix de vente) » pour ne pas tromper, et ajouter un second KPI « Valeur au coût » dès que le PMP existe. Brancher ce coût s


## FORTE-VALEUR

### Valorisation du stock affichée au prix de vente, libellée « Valeur » — image patrimoniale gonflée
- **Catégorie :** coherence-donnees · **Effort :** S
- **Constat :** Vérifié : le dashboard admin calcule totalValue = Σ(quantite × prix_vente) et l'affiche dans une Stat libellée « Valeur », en doré (mise en avant). C'est la valeur de revente, pas le coût du stock. En comptabilité le stock se valorise au coût (PMP/FIFO). Le libellé « Valeur » sans qualificatif laisse croire à un patrimoine/au cash. La sévérité 'forte-valeur' de l'expert est juste : trompeur mais p
- **Preuve :** apps/stock/app/v2/admin/page.tsx:130-133 (totalValue: stock.reduce((s,p)=>s+p.quantite*(p.prix_vente??0),0)) et :431-436 (Stat label='Valeur' value=`${Math.round(s.totalValue)} €` gold).
- **Pourquoi ça compte :** Afficher le stock à la valeur de vente gonfle l'image du patrimoine et fausse toute lecture rapide de trésorerie immobilisée. Un gérant qui voit « Valeur 18k€ » en doré croit avoir 18k€, alors que ça a coûté nettement moins. Risque de confiance en dé
- **Reco :** 1. Renommer la Stat existante en « Valeur de revente » (clarté immédiate, coût S). 2. Une fois le coût de référence joint (produits_fournisseurs/PMP), ajouter une Stat « Valeur au coût » + une « Marge potentielle » = revente - coût.

### Aucune page « Marges » pour le retail (Drive + Magasin) — seul le labo a des marges, isolées
- **Catégorie :** aide-decision-kpi · **Effort :** L
- **Constat :** Vérifié : l'arbo /v2/admin (activite, alertes, alertes-dlc, alertes-surplus, casse-anomalies, commandes-pro, comptes-pro, factures-pro, import-cashmag, import-stock, pointage, ramadan, rapport-mensuel, recap-fiscal, assistant-ia) ne contient AUCUNE page marges. Les seules marges du code sont dans le labo (lib/db/labo.ts : marge_eur_ht/pct, marge_eur_total) et concernent la production transformée —
- **Preuve :** ls apps/stock/app/v2/admin : aucune entrée marges. grep 'marge' confiné à lib/db/labo.ts. RevenueChart/listRevenueByDay (index.ts:1129) ne renvoient que CA particulier/pro.
- **Pourquoi ça compte :** Un manager doit identifier en quelques secondes les produits/catégories qui rapportent ou qui coûtent. Sans cette vue, le pilotage produit se fait au doigt mouillé — particulièrement gênant en halal premium où la qualité (coût élevé) doit se traduire
- **Reco :** 1. Une fois le coût de référence disponible, créer /v2/admin/marges : top/bottom produits marge €, marge % par catégorie, tendance. 2. Sources : commandes_drive_lignes × cout_ref_ht (produits_fournisseurs/PMP) ; magasin après rattachement produit. 3. Card 'Top 3 marge' au dashboard + export CSV.

### ventes_cashmag (magasin) sans FK produit — COGS magasin incalculable, jointure par nom fuzzy
- **Catégorie :** coherence-donnees · **Effort :** M
- **Constat :** Vérifié : ventes_cashmag_import porte designation (text NOT NULL) et code_barre (text nullable) mais aucune FK produit_id. Le rapport mensuel agrège le CA magasin par designation libre (clé de Map = designation), sans rattachement fiable au catalogue. Donc aucun coût ne peut être affecté aux ventes magasin → COGS et marge magasin impossibles. Note : monthly-report.ts ne fait même pas de jointure i
- **Preuve :** SCHEMA.md ventes_cashmag_import lignes 559-587 : designation/code_barre text, pas de produit_id. apps/stock/lib/cashbox/monthly-report.ts:82-99 — topProdMag indexé par row.designation (texte libre), a
- **Pourquoi ça compte :** Le magasin physique pèse une part importante du CA. Sans marge magasin, impossible de comparer la rentabilité magasin vs Drive ni de calculer une marge globale fiable. C'est une moitié du business aveugle côté rentabilité.
- **Reco :** 1. À l'import CashMag, résoudre produit_id via code_barre (EAN) quand présent → match exact sur produits.ean ; fallback designation→produit assisté. 2. Ajouter colonne produit_id (nullable au début) + indicateur de taux de rattachement. 3. Une fois rattaché, affecter cout_ref_ht et calculer la marge

### Cashmag CSV import ne décrémente PAS le stock
- **Catégorie :** coherence-donnees · **Effort :** M
- **Constat :** Confirmé : l'import des ventes magasin CashMag écrit uniquement dans la table ventes_cashmag_import, sans aucun mouvement de stock. Aucun appel à adjust_stock n'existe dans le chemin cashmag (ni route, ni cron, ni trigger). Le stock affiché ne reflète donc jamais les ventes physiques du comptoir. NUANCE non vue par l'expert : le purpose de la table est explicitement 'reconciliation with stock' (ra
- **Preuve :** apps/stock/app/api/cashbox/import-cashmag/route.ts:137-146 (upsert ventes_cashmag_import, zéro adjust_stock). SCHEMA.md:559-586 : table isolée, 'Purpose: Imported POS sales data for reconciliation wit
- **Pourquoi ça compte :** Ahmed/Otmane se fient au stock pour accepter ou refuser une commande Drive. Si les ventes comptoir ne décrémentent pas le compteur, le système peut promettre de la marchandise déjà vendue en magasin. C'est le coeur d'un outil de gestion : un seul sto
- **Reco :** Décider explicitement du modèle : soit (a) un cron post-import qui décrémente stock_par_depot via adjust_stock(type='sortie', reference_id='cashmag:{raw_hash}') — idempotent par hash déjà présent — soit (b) assumer que CashMag reste un canal de rapprochement et documenter que le stock Drive est tenu

### Pas de UNIQUE sur stock_movements.reference_id → double-décrément possible au retry
- **Catégorie :** fiabilite-stock · **Effort :** S
- **Constat :** Confirmé : aucune UNIQUE constraint sur reference_id (ni sur produit_id+depot_id+reference_id) dans aucune migration. Seul existe un index NON-unique (idx_stock_movements_reference). L'idempotence repose uniquement sur une dédup applicative (SELECT ... IN refs puis boucle) qui est bien une race-condition classique : deux appels concurrents avec le même reference_id lisent tous deux un SELECT vide 
- **Preuve :** migrations/20260604000002_stock_ledger_atomic.sql:51-52 (index non-unique). Aucun 'unique' lié à reference_id dans grep migrations. preparation-actions.ts:251-259 (dédup en mémoire). adjust_stock n'a 
- **Pourquoi ça compte :** Un retry réseau ou un double-clic sur 'Finaliser' peut sortir la marchandise deux fois. Le ledger qu'Ahmed utiliserait pour certifier un inventaire deviendrait faux. La constraint DB est le seul garde-fou fiable contre les concurrents.
- **Reco :** Ajouter une partial UNIQUE constraint : CREATE UNIQUE INDEX ON stock_movements (reference_id) WHERE reference_id IS NOT NULL — et faire l'INSERT ledger en ON CONFLICT DO NOTHING dans adjust_stock. ATTENTION : transfer_stock écrit DEUX lignes avec le même reference_id (source + destination), il faudr

### finalizePreparation() avale l'erreur de décrément stock — paiement capturé, stock intact
- **Catégorie :** fiabilite-stock · **Effort :** M
- **Constat :** Confirmé : le bloc de décrément stock (étape 3b) est dans un try/catch log-and-continue, APRÈS la capture Stripe (étape 2) qui, elle, est bloquante. Si adjust_stock lève (désormais possible : la migration 0003 fait lever adjust_stock sur stock insuffisant pour type 'sortie'), l'erreur est juste loggée, la commande passe à 'pret' et le client est notifié. Résultat : argent encaissé, marchandise non
- **Preuve :** preparation-actions.ts:277-287 (console.error puis continue, pas de propagation) et :237 (try englobant non bloquant). Capture Stripe :180-206 bloquante AVANT. migration 20260608000003_adjust_stock_bl
- **Pourquoi ça compte :** Le soir, Ahmed compare stock théorique et physique : écart silencieux à chaque échec de décrément, sans alerte. Pas de réconciliation possible. La combinaison 'capture bloquante + décrément non bloquant' garantit que les erreurs penchent toujours du 
- **Reco :** Au minimum, en cas d'échec adjust_stock : insérer une alerte/tâche staff (table d'incidents ou drive_ecarts) au lieu d'un simple console.error invisible en prod. Idéalement, décrémenter le stock AVANT la capture (réserver le stock), et si le décrément échoue, ne pas capturer. Le clamp DB rend désorm

### Points de recommande figés, pas de tableau de bord de suivi
- **Catégorie :** aide-decision-kpi · **Effort :** M
- **Constat :** Le système PO calcule des suggestions via forecast Holt + multiplicateur hijri, mais il n'existe aucun cockpit montrant l'écart réalisé vs prédit par produit, ni le suivi des causes de rupture. Otmane ne dispose d'aucun écran pour savoir QUOI ajuster quand des ruptures surviennent — il ajusterait à l'aveugle.
- **Preuve :** VÉRIFIÉ. apps/stock/app/api/po/auto-generate/route.ts:143,165 — LEAD_DEFAULT=3 et seuilDecl=LEAD_DEFAULT×FACTEUR_SECU(1.5)=4.5j en dur. Seules pages admin existantes (ls apps/stock/app/v2/admin/): act
- **Pourquoi ça compte :** C'est le KPI achat le plus actionnable pour un gérant : sans visualiser où Holt sur/sous-estime, impossible de calibrer les seuils. La sophistication du moteur Holt+hijri est perdue faute de boucle de feedback visible. Otmane ne fera pas confiance à 
- **Reco :** Persister une trace historique forecast (snapshot velocity_adj/days_cover prédit par jour) puis créer /v2/admin/forecast-audit avec: (1) écart réalisé vs prédit par produit/catégorie sur 30/90j, (2) liste des ruptures des 90j avec cause probable, (3) suggestion d'ajustement quand l'écart dépasse un 

### Zéro historique de fiabilité fournisseur (lead time réel vs prévu, écarts, retards)
- **Catégorie :** achats-fournisseurs · **Effort :** L
- **Constat :** Le lead_time est une valeur statique saisie à la main; la réalité (respect du lead annoncé, écarts quantité, retards) n'est jamais agrégée par fournisseur. L'auto-PO dimensionne sa couverture sur une hypothèse jamais validée par les livraisons réelles.
- **Preuve :** VÉRIFIÉ avec correction de localisation. lead_time_jours et min_commande_euros sont sur la table fournisseurs (20260530000005_purchase_orders.sql:30-31), PAS sur produits_fournisseurs comme l'affirmai
- **Pourquoi ça compte :** La matière première de l'agrégation existe déjà (ecart_qte par BDL) — il ne manque que le rollup. Un fournisseur qui livre en 5j alors que lead=3j génère des ruptures récurrentes que le gérant subit comme une fatalité, faute de badge de fiabilité.
- **Reco :** Cron hebdo agrégeant les BDL des 90j en supplier_metrics (lead réel médian, on_time_rate, écart_qte moyen). Badge fiabilité dans /v2/fournisseurs et substitution de lead_time_jours par le médian réel dans auto-generate. Le défaut est réel; effort réduit car ecart_qte est déjà persisté.

### Multiplicateurs hijri figés 'estim_otmane_v1', jamais recalibrés après l'événement
- **Catégorie :** aide-decision-kpi · **Effort :** M
- **Constat :** Les multiplicateurs de demande hijri (dattes ×4.5 pré-Ramadan, viande ×3 Aïd Adha) sont des estimations manuelles gravées, sans aucun job de recalibration post-fête. Le 'moat' de prédiction du pic se dégrade à chaque saison faute d'apprentissage sur le réalisé.
- **Preuve :** VÉRIFIÉ. hijri_demand_curve.source DEFAULT 'estim_otmane_v1' (predictive_stockout.sql:51); seed commenté 'à raffiner après Ramadan 2026 avec données réelles' (ligne 56). grep recalibrate/recompute-hij
- **Pourquoi ça compte :** Le pitch vendeur de l'app est d'anticiper les pics religieux. Des multiplicateurs non corrigés sur-stockent (immobilisation de trésorerie) ou sous-stockent (rupture en plein pic = vente perdue irrécupérable). C'est exactement le chiffre où le gérant 
- **Reco :** Cron recalibrate-hijri lancé après chaque grande fête: comparer velocity réalisée vs prédite par phase×catégorie, et si l'écart dépasse ~15% proposer un nouveau multiplicateur versionné (source 'v2_post_ramadan_2026') avec snapshot d'audit, plutôt qu'écraser en silence. Présenter un rapport comparat

### Drive au poids : divergence estimé ↔ réel non transparente au client avant retrait
- **Catégorie :** drive-conversion-confiance · **Effort :** M
- **Constat :** Le client voit « Estimation » au panier + bandeau « débité du poids réel », mais aucune plage d'écart attendue ni exemple chiffré. Le code confirme : Cart.tsx:273-296 et Checkout.tsx:348-369 affichent un bandeau Scale générique avec lien « En savoir plus » vers /drive-au-poids, mais zéro contexte sur l'ampleur de l'écart possible. Le montant pré-autorisé (estimation × 1,20, soit +20% UNIQUEMENT su
- **Preuve :** apps/drive/src/pages/Cart.tsx:273-296 (bandeau), apps/drive/src/pages/Checkout.tsx:348-369 (« Montant autorisé … (estimation × 1,20) »), supabase/functions/create-checkout-session/index.ts:159-170 (ma
- **Pourquoi ça compte :** Le Drive au poids est l'USP de Salamarket. Un client surpris par un blocage carte à 1,20× ou par une facture différente de l'estimation génère réclamation et avis négatif, et fait douter Ahmed de la transparence de la marque halal premium.
- **Reco :** Sur PDP et Cart, transformer le bandeau en bloc pédagogique : expliquer que les +20% sont une simple PRÉ-autorisation (pas un débit), libérée sous 7 jours, et que la facture finale = poids réel pesé. Ajouter un mini-exemple chiffré inline (« 1,5 kg estimé à 18 €/kg → on bloque 32,40 €, on débite ~27

### Slot lead-time race : créneau vert côté client puis rejeté serveur à la frontière 1h
- **Catégorie :** drive-conversion-confiance · **Effort :** S
- **Constat :** La règle « délai 1h » est appliquée à l'IDENTIQUE des deux côtés sans aucune marge : client useSlots.ts:27 (`start - now >= 60*60*1000`) et serveur create-checkout-session/index.ts:181 (`slotStartMs - Date.now() < 60*60*1000` → erreur). Un client qui sélectionne un créneau à T-51min puis met 1-2 min à remplir notes/carte franchit la frontière : le serveur renvoie 400 « Ce créneau n'est plus réserv
- **Preuve :** apps/drive/src/hooks/useSlots.ts:8,27 ; supabase/functions/create-checkout-session/index.ts:180-182 (renvoie 400, pas 409) ; apps/drive/src/pages/Checkout.tsx:209-221 (toast sans clear cart)
- **Pourquoi ça compte :** La 1re tentative de commande échoue avec un message brut, juste après l'effort de remplir le formulaire. Récupérable (panier intact) mais frustrant. En démo, Ahmed verrait un échec checkout inexpliqué = doute sur la stabilité.
- **Reco :** Côté serveur, tolérer une marge réseau : rejeter seulement si slotStartMs - now < 55min (laisse ~5 min de latence/skew) — c'est le créneau de 30 min, pas un vrai risque opérationnel. Router ce cas vers un message dédié avec action « Choisir un autre créneau » comme le fait déjà le 409, au lieu d'un 

### Remise DLC : EST persistée dans localStorage MAIS jamais facturée (serveur recalcule au plein tarif)
- **Catégorie :** drive-conversion-confiance · **Effort :** M
- **Constat :** L'expert affirme que dlcUnitPriceCents n'est jamais persisté (« le persist middleware ne l'inclut pas »). FAUX : cartStore.ts:104-294 utilise persist SANS partialize, donc Zustand sérialise TOUT le tableau items, y compris dlcUnitPriceCents (champ CartItem ligne 35). Le snapshot survit au rechargement. Deuxième erreur : au checkout, le serveur create-checkout-session/index.ts:72-135 RE-LIT les pri
- **Preuve :** apps/drive/src/stores/cartStore.ts:280-293 (persist sans partialize) + :35 (dlcUnitPriceCents) ; apps/drive/src/pages/Checkout.tsx:180-194 (payload sans dlc) ; supabase/functions/create-checkout-sessi
- **Pourquoi ça compte :** La remise DLC anti-gaspi (~70 k€/an) est affichée au client mais JAMAIS appliquée au paiement réel : il voit -30% au panier et est débité au plein tarif. Perte de confiance et risque de litige bien plus grave que le scénario localStorage imaginé — ma
- **Reco :** Transmettre la remise au backend : ajouter dlc_unit_price_cents au payload Checkout.tsx, et côté create-checkout-session valider la remise contre dlc_pricing_rules (jamais faire confiance au prix client brut) avant de l'appliquer aux line_items. Tant que ce n'est pas fait, masquer l'affichage de la 

### Plafond de crédit Pro vérifié uniquement côté client : bypass trivial
- **Catégorie :** b2b-pro · **Effort :** M
- **Constat :** Confirmé. Le seul contrôle de dépassement vit dans Panier.tsx:188-195 (creditDepasse = total + encoursActuel snapshot client > encoursMax) qui désactive le bouton. Le trigger DB recalc_encours_compte_pro est AFTER INSERT/UPDATE (0025:260-266) : il met à jour encours_actuel APRÈS coup, il ne peut rien rejeter. La RLS delegue_insert_commandes_pro (20260608000001) vérifie seulement que le compte est 
- **Preuve :** /Users/mac/salamarket/apps/drive/src/pages/pro/Panier.tsx:188-195 + :217-222 (seul garde-fou, client) ; trigger AFTER _archive/0025_drive_pro.sql:260-266 ; RLS 20260608000001 (with check = statut acti
- **Pourquoi ça compte :** Un plafond de crédit non opposable = risque de trésorerie direct. Ahmed accorde 5k€ à un resto, le resto se retrouve à 12k€ d'encours, fait défaut : perte sèche. Un plafond doit bloquer physiquement, pas afficher un warning contournable.
- **Reco :** Vérifier le plafond côté serveur de façon atomique : soit une Edge Function/RPC 'creer_commande_pro' qui SELECT ... FOR UPDATE l'encours et rejette si dépassement, soit un trigger BEFORE sur commandes_pro_lignes qui lève une exception si SUM(encours non soldé) > encours_max. Garder le garde-fou clie

### Pas d'état de compte / historique encours par client Pro pour décider du crédit
- **Catégorie :** b2b-pro · **Effort :** M
- **Constat :** Fondé. comptes-pro/page.tsx n'affiche qu'un snapshot live (EncoursBar actuel/max, page.tsx:212-214,359) sans aucune timeline des commandes/paiements du client. Il n'existe pas de page /comptes-pro/[id]/historique ni de relevé. La brique 'marquer payé' existe bien (marquerPayee, pro.ts:240-250) et factures-pro liste les factures, mais rien ne consolide PAR CLIENT 'commandé X, payé Y, reste dû Z' da
- **Preuve :** /Users/mac/salamarket/apps/stock/app/v2/admin/comptes-pro/page.tsx:212-214 et :359 (EncoursBar = snapshot live) ; aucune route historique/relevé sous comptes-pro/ (un seul page.tsx)
- **Pourquoi ça compte :** La décision de crédit B2B se prend sur le COMPORTEMENT de paiement, pas sur un solde instantané. Sans relevé par client, Ahmed pilote son risque à l'aveugle et ne peut pas produire un état de compte à envoyer au client en cas de litige.
- **Reco :** Ajouter un détail compte Pro listant ses commandes (date, montant, statut, date_paiement) triées DESC + un récap dû/payé/en retard, et un bouton 'relevé PDF' réutilisant le module brand existant. Données déjà toutes disponibles (commandes_pro.date_paiement, date_echeance une fois le constat 1 corrig

### Validation de commande Pro sans garde-fou d'encours : le manager peut dépasser le plafond
- **Catégorie :** b2b-pro · **Effort :** M
- **Constat :** Fondé. avancer() (commandes-pro/page.tsx:126-156) ne contrôle QUE le seuil de validation manager (montant_ttc > 500€). Aucune vérification que valider la commande ferait dépasser encours_max du compte. Le passage en 'validee' pose validee_par_profile_id/validee_at (pro.ts:227-231) sans aucun check d'encours. La carte rouge de dépassement (comptes-pro page.tsx:316) est purement cosmétique : un mana
- **Preuve :** /Users/mac/salamarket/apps/stock/app/v2/admin/commandes-pro/page.tsx:126-156 (avancer ne vérifie que SEUIL_VALIDATION_MANAGER, pas l'encours) ; /Users/mac/salamarket/apps/stock/lib/db/pro.ts:227-231 (
- **Pourquoi ça compte :** Un plafond annoncé mais que le staff peut franchir sans friction ni trace = règle de gestion fictive. Couplé au constat 2 (pas de blocage à la création), il n'existe AUCUN point du flux où l'encours_max est réellement opposé. Ahmed croit avoir des pl
- **Reco :** À la validation, si encours_actuel + montant_ttc > encours_max : soit refuser (cohérent avec un vrai plafond), soit exiger un override admin explicite tracé (colonne validee_par_exception + raison). Documenter le choix dans WORKFLOW.md. Vérif : valider une commande qui dépasse le plafond → bloqué ou

### SIRET et TVA intracom non vérifiés à l'inscription Pro (format seul)
- **Catégorie :** b2b-pro · **Effort :** M
- **Constat :** Fondé. Inscription.tsx valide le SIRET par regex de FORMAT uniquement (SIRET_RE = /^\d{14}$/, ligne 61) sans contrôle d'existence (API SIRENE) ni checksum Luhn. La TVA intracom est encore plus laxe : z.string().max(20).optional — aucun format imposé. Un client peut s'inscrire avec SIRET=00000000000001 et TVA='ABC'. Le compte part en 'en_validation' donc un humain peut filtrer, mais l'outil ne four
- **Preuve :** /Users/mac/salamarket/apps/drive/src/pages/pro/Inscription.tsx:61 (SIRET_RE format seul, pas de checksum/SIRENE) et le schéma tva_intracom z.string().max(20) sans regex
- **Pourquoi ça compte :** Une facture B2B française doit porter un SIRET valide ; un SIRET bidon = facture légalement fragile et risque de fraude (commander à crédit puis disparaître). Au minimum un checksum Luhn (gratuit, instantané, hors-ligne) écarte 90% des saisies erroné
- **Reco :** Ajouter le checksum Luhn sur le SIRET (validation locale, zéro dépendance) et une regex stricte FR + clé sur la TVA intracom. En option, appel à l'API SIRENE (gratuite, gouv.fr) à la validation admin pour pré-remplir/confirmer la raison sociale. Idéalement côté serveur.

### Clôture Z quotidienne : données Drive uniquement, pas de réconciliation Cashmag
- **Catégorie :** fiscal-conformite · **Effort :** M
- **Constat :** La Z quotidienne (computeDailyZ) agrège UNIQUEMENT commandes_drive. Les ventes magasin (Cashmag) importées dans ventes_cashmag_import ne sont jamais réconciliées avec le Drive dans une Z quotidienne consolidée. Seul le rapport MENSUEL (computeMonthlyReport) joint les deux sources — il n'existe aucune clôture journalière consolidée Drive+Magasin.
- **Preuve :** apps/stock/lib/cashbox/daily-z.ts:98-108 — requête .from('commandes_drive') uniquement, .neq('statut','annule'), aucune lecture de ventes_cashmag_import. monthly-report.ts:71-99 agrège bien les deux m
- **Pourquoi ça compte :** Le gérant veut une photo journalière fiable du CA total (Drive + magasin). Aujourd'hui il doit croiser à la main la Z Drive et le ticket Cashmag — source d'erreur et de défiance. NUANCE vs l'expert : le doc daily-z.ts:1-8 déclare lui-même que Salam D
- **Reco :** Ajouter une option 'Z consolidée' au récap quotidien qui agrège commandes_drive + ventes_cashmag_import du jour, avec TVA ventilée et une ligne de réconciliation. Réutiliser la logique déjà écrite dans monthly-report.ts. Ne pas la présenter comme une Z fiscale certifiée (elle ne l'est pas).

### Capture Stripe : aucune vérification de l'expiration de la pré-autorisation
- **Catégorie :** fiscal-conformite · **Effort :** S
- **Constat :** La route /api/stripe/capture-payment lit montant_autorise_ttc et statut_paiement='autorise' mais ne lit ni ne vérifie jamais autorisation_expire_at. Si la pré-auto (7 jours) a expiré, le code tente quand même la capture ; Stripe renvoie une erreur générique que le staff voit comme 'stripe_capture_failed' avec un message brut, sans action claire.
- **Preuve :** apps/stock/app/api/stripe/capture-payment/route.ts:84-92 (le SELECT ne demande pas autorisation_expire_at), ligne 109 (check sur statut_paiement seulement), ligne 170-195 (la capture part sans contrôl
- **Pourquoi ça compte :** Commande oubliée puis retirée après 7 jours : le staff se retrouve face à une erreur Stripe cryptique au comptoir, devant le client. Perte de vente et image d'amateurisme. Un message 'Pré-autorisation expirée — redemander le paiement au client' évite
- **Reco :** Ajouter autorisation_expire_at au SELECT et, avant la capture (~ligne 148), if (cmd.autorisation_expire_at && new Date() > new Date(cmd.autorisation_expire_at)) return 409 'autorisation_expiree' avec consigne staff. Effort minime.

### Aucun coût d'achat catalogue ni indicateur de marge Drive
- **Catégorie :** aide-decision-kpi · **Effort :** L
- **Constat :** Le modèle de données ne porte aucun coût d'achat au niveau produit : produits n'a pas de prix_achat/cout_unitaire, stock_par_depot n'a que prix_vente. Le coût d'achat n'existe QUE sur les lignes de PO/BDL (purchase_order_lignes.prix_achat_ht, bons_de_livraison_lignes.prix_achat_ht) — donnée transactionnelle non remontée en CMUP/PMP catalogue. Conséquence : impossible de calculer une marge Drive (C
- **Preuve :** SCHEMA.md table produits (cols listées, aucune cost) et stock_par_depot:285-293 (prix_vente seul). prix_achat_ht présent uniquement dans migrations 20260530000005_purchase_orders.sql:52,111 et 2026053
- **Pourquoi ça compte :** Un épicier pilote par la marge, pas par le CA. Sans coût catalogue, Ahmed ne sait jamais si un produit Drive est rentable. C'est la lacune de gestion la plus structurante du lot : l'outil track les ventes mais ne dit pas si elles gagnent de l'argent.
- **Reco :** Court terme : dériver un coût d'achat par produit depuis le dernier prix_achat_ht reçu (BDL/PO) ou ajouter produits.cout_achat_ht_dernier mis à jour à la réception. Puis une vue v_marge_drive (CA, coût, marge € et %) et un écran admin. Effort réel élevé car il faut alimenter et fiabiliser le coût.

### montant_reel_ttc modifiable par la clé anon (RLS rouverte) — mais capture bornée par la pré-auto
- **Catégorie :** fiscal-conformite · **Effort :** M
- **Constat :** La RLS sur commandes_drive_lignes est effectivement rouverte en anon SELECT+ALL : le hotfix 20260531000020 ré-ouvre 'anon SELECT + ALL' sur toutes les tables Stock car l'app n'a pas Supabase Auth. Donc un porteur de la clé anon publique peut écrire montant_reel_ttc directement via PostgREST. Côté app, l'écriture passe par une server action (markLineWeighed, supabaseServer service-role) — donc le c
- **Preuve :** supabase/migrations/20260531000020_hotfix_rls_reopen_stock.sql (ré-ouvre anon ALL sur commandes_drive_lignes, ticket Mission 4). lib/staff/preparation-actions.ts:1-17,40-87 (markLineWeighed = 'use ser
- **Pourquoi ça compte :** NUANCE DÉCISIVE vs l'expert : son scénario 'staff écrit 1000g, capture Stripe gonflée, facture client fausse' est FAUX — la capture est plafonnée au montant pré-autorisé, on ne peut PAS débiter le client au-delà. Le vrai risque résiduel est : (a) fal
- **Reco :** Prioriser Mission 4 (bascule Stock sur service-role server-side + restaurer staff_read/staff_write). En attendant, la borne capture protège déjà le client du sur-débit. Optionnel : verrouiller montant_reel_ttc en UPDATE après statut_paiement='capture' (immutabilité post-capture).

### Aucune notion de Z magasin clôturée : le CA hier n'est jamais « verrouillé »
- **Catégorie :** coherence-donnees · **Effort :** M
- **Constat :** FONDÉ avec nuance. Il n'existe aucune table de clôture (pas de cockpit_z_cloturation, pas de statut provisoire/validée). Le CA hier vient de la MV qui agrège ventes_cashmag_import sur date_vente (date seule). MAIS l'affichage porte sur J-1 (hier), pas le jour en cours, et la MV est rafraîchie par cron 06h — pas en live — donc le scénario « change dans 10 min » de l'expert est faible. Le vrai probl
- **Preuve :** hero-kpi.tsx:134-140 (caHier===null → 'En attente du Z') ; mv_ventes_quotidiennes agrège sur date_vente sans depot_id (0034:114-125) ; aucune table de clôture dans supabase/migrations. snapshot/route.
- **Pourquoi ça compte :** Ahmed juge sa journée sur ce CA. S'il a oublié d'importer la Z Cashmag de la veille (ou import partiel), l'outil affiche un chiffre faussement bas SANS le signaler — il croit avoir fait une mauvaise journée. La confiance se construit sur 'ce chiffre 
- **Reco :** A minima : afficher la fraîcheur/complétude de l'import (date du dernier import Cashmag pour J-1, nb tickets) et un badge 'Import incomplet' si pas d'import sur la journée. Idéal : table cockpit_z_cloturation (jour, depot_id, montant_ttc, nb_tickets, statut provisoire/validée, cloture_at) renseignée

### Stock valorisé au prix de vente, jamais au coût d'achat → marge non pilotable
- **Catégorie :** marge-rentabilite · **Effort :** M
- **Constat :** FONDÉ. La table produits (SCHEMA.md:195-220) n'a AUCUNE colonne de coût (pas de prix_achat, cout_unitaire, PMP). stock_par_depot (SCHEMA.md:281-291) n'a que prix_vente. PilotageStrip affiche donc la valeur de stock × prix_vente (pilotage.ts:125), jamais un coût ni une marge. Nuance qui RENFORCE la reco : prix_achat_ht existe déjà sur les lignes PO (0005) et lignes BDL (0006), et cout_unitaire_ht e
- **Preuve :** SCHEMA.md:195-220 (produits, aucune col coût) ; SCHEMA.md:281-291 (stock_par_depot: quantite, prix_vente uniquement) ; apps/stock/lib/db/pilotage.ts:121-130 (val += q * prix_vente) ; coût présent mais
- **Pourquoi ça compte :** La marge est LE KPI d'une épicerie. L'outil dit 'tu as 45k€ de stock' mais jamais 'ça t'a coûté 28k€'. Otmane ne peut pas voir s'il vend à perte (promo DLC, casse) ni comparer la rentabilité par catégorie. Pour un outil de gestion, omettre la marge, 
- **Reco :** Ajouter produits.prix_achat_ht (ou un PMP recalculé depuis les réceptions BDL où prix_achat_ht existe déjà). Vue v_stock_valorisation (depot, produit, quantite, valeur_achat, valeur_vente, marge_brute_eur/pct). Carte 'Marge brute du stock' au cockpit. La donnée d'achat existant déjà à la réception, 

### Briefing du matin sans boucle de feedback : actions jamais tracées ni mesurées
- **Catégorie :** aide-decision-kpi · **Effort :** L
- **Constat :** FONDÉ. Le scoreur (briefing/route.ts:117-252) produit 3 actions deep-linkées, mais onAction (morning-brief.tsx:163-165) est une simple navigation. Aucune table action_cockpit_log, aucun statut completed/acked, aucune liaison action→impact. Si les données ne changent pas, la même action réapparaît le lendemain. Impossible de mesurer 'la démarque DLC d'hier a-t-elle évité la casse ?'. Le briefing es
- **Preuve :** briefing/route.ts:117-252 (scoreCandidats, scores déterministes, aucun persist) ; morning-brief.tsx:163-165 (onClick → onAction(href) = navigation seule) ; aucune table action_cockpit_log dans supabas
- **Pourquoi ça compte :** Le briefing IA est la signature de l'outil. Sans boucle de feedback, Ahmed ne sait pas si agir sert. En démo c'est un wow visuel ; en exploitation, sans mesure d'impact, ça devient du bruit répétitif que le staff finit par ignorer.
- **Reco :** Table action_cockpit_log (jour, depot_id, categorie, texte, score, affichee_at, clicked_at, completed_at). Passer action_id en deep-link, badge 'marquer comme fait' sur l'écran cible, et un récap 'hier X actions, Y faites'. Phase 2 (valeur max) : corréler action × ventes pour mesurer l'impact réel.

### Le cockpit ne montre AUCUN KPI de marge / rentabilité par catégorie
- **Catégorie :** marge-rentabilite · **Effort :** L
- **Constat :** FONDÉ (proche du #3 mais angle décision). CockpitSnapshot (snapshot/route.ts) n'expose que ventes_hier, delta N-1, dlc, stockout, casse, competitor — zéro champ marge_brute_eur/pct. Le delta concurrent EXISTE déjà (snapshot/route.ts calcule delta_pct = (releve - prix_salam)/prix_salam, CompetitorCard l'affiche) mais ne le traduit pas en impact marge/ventes. Ahmed voit un bon CA sans savoir si ce C
- **Preuve :** snapshot/route.ts interface CockpitSnapshot (ventes/dlc/stockout/casse/competitor, aucun champ marge) ; competitor delta déjà calculé dans le bloc 'Process competitor' de snapshot/route.ts ; absence d
- **Pourquoi ça compte :** Marge = santé du commerce. Un CA élevé à marge écrasée (promos, casse viande) ressemble à une bonne journée dans l'outil. Sans marge par catégorie, Ahmed pilote à l'aveugle sur la profitabilité — précisément ce qu'un outil de gestion doit éclairer.
- **Reco :** Dépend du coût d'achat (#3). Une fois prix_achat_ht remonté au produit : view v_ventes_quotidiennes_marge (jour, categorie, ca_ttc, cout_ttc, marge_eur/pct, target), carte 'Marge du jour vs cible' au cockpit, et intégration au scoreur du briefing ('Épicerie sous-marge -2% hier — check les promos').

### Ruptures imminentes comptées sans tenir compte du délai fournisseur (lead time)
- **Catégorie :** aide-decision-kpi · **Effort :** M
- **Constat :** FONDÉ et la donnée pour le corriger EXISTE. v_stockout_critiques / stockout_forecast (0035) exposent days_cover et tier, mais AUCUN lead_time. Le tier est dérivé du seul days_cover. PilotageStrip n'affiche qu'un count(*) ('N ruptures imminentes') sans distinguer 'à commander aujourd'hui' de 'peut attendre'. Or fournisseurs.lead_time_jours EXISTE (migration 0005 ligne 30) mais n'est jamais joint au
- **Preuve :** 20260530000004_predictive_stockout.sql:122-146 (v_stockout_critiques: days_cover, tier, pas de lead_time) ; 20260530000005_purchase_orders.sql:30 (fournisseurs.lead_time_jours existe) ; v2/PilotageStr
- **Pourquoi ça compte :** Otmane lit '5 ruptures imminentes' et lance 5 PO. Peut-être 2 sont urgentes (lead 2j), 3 peuvent attendre (lead 7j, 30j de couverture). Sans le lead time, il perd du temps en PO inutiles ou rate une vraie urgence. La donnée existe déjà, c'est juste u
- **Reco :** Joindre fournisseurs.lead_time_jours dans stockout_forecast/v_stockout_critiques, calculer urgence = CASE WHEN days_cover - lead_time < 1 THEN 'rupture_24h' ... Afficher 'N achats urgents · M à surveiller' en PilotageStrip et prioriser dans le scoreur du briefing.

### CA Drive : pilotage utilise montant capturé, daily-z/monthly-report utilisent l'estimé
- **Catégorie :** coherence-donnees · **Effort :** M
- **Constat :** pilotage.ts (cockpit/dashboard du jour) calcule le CA Drive avec montant_capture_ttc ?? total_ttc — le montant RÉELLEMENT capturé après pesée. Mais daily-z.ts et monthly-report.ts agrègent uniquement total_ttc — l'estimé au moment de la commande. Pour toute commande au poids avec écart, le cockpit et les rapports fiscaux divergent.
- **Preuve :** pilotage.ts:98 (montant_capture_ttc ?? total_ttc) vs daily-z.ts:184-185 (modes/caTtc += Number(c.total_ttc), select ne ramène même pas montant_capture_ttc l.101-102) vs monthly-report.ts:135 (driveCaT
- **Pourquoi ça compte :** Le CA du jour vu le matin (capturé) ne réconcilie pas avec le Z journalier et le rapport mensuel (estimé) remis au comptable. Sur une épicerie où viande/fromage au poids pèsent lourd, les écarts s'accumulent → CA fiscal sous-évalué et incohérent avec
- **Reco :** Unifier la règle : utiliser montant_capture_ttc ?? total_ttc dans daily-z.ts ET monthly-report.ts (et ajouter montant_capture_ttc au SELECT de daily-z). Idéalement, matérialiser un ca_reel_ttc non-nullable sur commandes_drive (trigger après pesée) pour une source unique.

### Ledger stock sans contrainte UNIQUE sur reference_id — dédup seulement applicative (TOCTOU)
- **Catégorie :** fiabilite-stock · **Effort :** M
- **Constat :** adjust_stock() n'a effectivement aucune dédup SQL sur reference_id : deux appels avec le même reference_id écrivent deux lignes et décrémentent deux fois. MAIS le constat ignore que le SEUL appelant réel (finalizePreparation) implémente déjà une garde applicative : il lit stock_movements par reference_id ('drive:{cmd}:{ligne}'), construit un doneSet et SAUTE les lignes déjà mouvementées avant d'ap
- **Preuve :** adjust_stock sans ON CONFLICT/UNIQUE : migrations 20260604000002 (l.27-142) et 20260608000003. Garde applicative : apps/stock/lib/staff/preparation-actions.ts:251-266 (SELECT reference_id → doneSet → 
- **Pourquoi ça compte :** Le stock affiché doit être fiable pour qu'Ahmed signe ses chiffres. La protection existe mais repose sur une lecture non verrouillée : sous charge (Ramadan, finalisations simultanées) un double décrément reste possible et silencieux.
- **Reco :** Sceller la garantie en base : UNIQUE INDEX partiel sur stock_movements(type, reference_id) WHERE reference_id IS NOT NULL, et dans adjust_stock faire l'INSERT ledger en ON CONFLICT DO NOTHING en n'appliquant l'UPDATE stock que si l'INSERT a réellement inséré. Rend l'idempotence vraie même en concurr

### Trigger de recalcul des montants Pro sans garde sur le statut de la commande
- **Catégorie :** fiscal-conformite · **Effort :** S
- **Constat :** recompute_commande_pro_montants() se déclenche AFTER INSERT/UPDATE/DELETE sur commandes_pro_lignes et réécrit montant_ht/tva/ttc de la commande sans AUCUNE vérification du statut. Toute modification de ligne sur une commande déjà 'facturee'/'payee' recalcule rétroactivement les montants → divergence facture émise vs DB. Confirmé : le trigger (migration 20260608000004) n'a pas de WHERE statut. À nu
- **Preuve :** supabase/migrations/20260608000004_commande_pro_montants_trigger.sql — fonction recompute_commande_pro_montants() sans clause sur statut ; trigger AFTER INSERT/UPDATE/DELETE inconditionnel.
- **Pourquoi ça compte :** Client Pro = restaurant halal partenaire, facture B2B = document comptable. Un montant qui change après émission casse la réconciliation et la confiance B2B. Même si seul le staff peut déclencher, un garde-fou empêche l'erreur humaine d'altérer une f
- **Reco :** Ajouter dans le trigger : si la commande est dans un statut terminal (facturee/payee/annulee), RAISE EXCEPTION ou no-op (return). N'autoriser le recalcul que pour les statuts éditables (a_valider/validee/en_preparation).

### Catalogue dédoublé produits/products : FK Pro pointent sur products, FK Drive sur produits, sans sync
- **Catégorie :** coherence-donnees · **Effort :** L
- **Constat :** Confirmé par le schéma : produits_pro_prix.produit_id et commandes_pro_lignes.produit_id référencent products(id), alors que commandes_drive_lignes.produit_id, stock_par_depot, receptions référencent produits(id). products est une TABLE physique (la migration 0023 voulait en faire une vue mais ne l'a jamais été en prod ; 0030 seed dans les DEUX). Aucun trigger ne synchronise nom/prix/visibilité en
- **Preuve :** SCHEMA.md:122-160 (Architectural Debt) ; SCHEMA.md:1122 (produits_pro_prix FK products CASCADE), 1209 (commandes_pro_lignes FK products RESTRICT), 150 (FK split documenté) ; migration 0030 seed dans p
- **Pourquoi ça compte :** Un client B2B Pro voit un prix calculé sur une fiche products potentiellement périmée pendant que le stock/staff travaille sur produits. Double saisie = erreur humaine garantie, et un écart de prix vu en démo détruit la confiance d'Ahmed dans l'intég
- **Reco :** Exécuter l'intention de 0023 dans une migration atomique : migrer les FK Pro vers produits(id), drop la table products, recréer products comme VUE sur produits (mapping FR→EN, filtre visible_drive). Une seule source de vérité, zéro double saisie.

### Commandes Drive au poids n'existent que dans commandes_drive, jamais dans orders
- **Catégorie :** coherence-workflow · **Effort :** L
- **Constat :** Confirmé : les commandes Drive au poids sont créées directement dans commandes_drive par l'edge function, sans row dans orders ; le trigger forward sync_drive_order_to_stock_trigger (orders→commandes_drive) ne fire pas pour elles. C'est documenté comme VOULU dans WORKFLOW.md. Le vrai risque n'est donc pas un 'orphelinat' accidentel mais un piège analytique : tout écran/rapport CA qui lit orders (f
- **Preuve :** WORKFLOW.md:313-315 (Drive au poids bypass, pas de row orders) ; WORKFLOW.md:291-313 (sync forward/reverse orders↔commandes_drive) ; SCHEMA.md:409 (orders = legacy Checkout flow).
- **Pourquoi ça compte :** Si un tableau de bord ou un export comptable agrège depuis orders, le CA des ventes au poids (cœur du Drive halal : viandes, traiteur) est invisible. Ahmed ne peut pas faire confiance à un chiffre dont la valeur dépend de la table interrogée.
- **Reco :** Documenter et imposer commandes_drive comme SEULE source de vérité Drive pour tout reporting CA ; auditer chaque écran/export qui lit orders et le rebrancher. Idéalement, créer une vue unifiée v_commandes_drive_all qui réconcilie legacy+au poids pour les rapports.

### Lots périmés (niveau 'forcé') invisibles au Drive, mais stock non marqué pour démarque physique
- **Catégorie :** anti-gaspi-dlc · **Effort :** M
- **Constat :** Vérifié : v_dlc_alerts calcule niveau='forcé' quand l.dlc <= current_date (20260604000001:base CASE). Le Drive exclut bien les 'forcé' (CourteDateBanner.tsx:41 .neq('niveau_alerte','forcé') ; HalalBadgeLink.tsx:143-144 filter niveau≠'forcé'/'ok'). Et produits_lots (20260530000000) n'a AUCUNE colonne d'état de vente : seulement quantite_restante (ajoutée par FEFO). Un lot 'forcé' reste donc dans pr
- **Preuve :** 20260530000000_lots_traceability.sql:23-45 (produits_lots : pas de colonne etat_vente/status) ; 20260604000003_fefo_lots.sql:25 ajoute seulement quantite_restante ; CourteDateBanner.tsx:41 ; HalalBadg
- **Pourquoi ça compte :** À la clôture, Ahmed/Otmane ont un stock théorique qui inclut des lots périmés (invisibles au Drive) sans qu'aucune démarque n'ait été enregistrée. Le lot périmé n'apparaît ni dans sorties_stock ni dans la casse tant que le staff ne déclare pas manuel
- **Reco :** Sur /v2/admin/alertes-dlc, pour un lot 'forcé', ajouter un bouton 'Retirer du rayon' qui (1) crée une sortie type='perime_dlc' liée au lot via consume_lot_fefo, (2) décrémente quantite_restante à 0. Tant qu'un lot 'forcé' a quantite_restante>0, afficher un badge rouge 'Action requise'. Pas besoin d'

### price_per_kg sans contrainte NOT NULL pour les produits au poids → casse/prix à 0€
- **Catégorie :** anti-gaspi-dlc · **Effort :** M
- **Constat :** Vérifié : produits.price_per_kg est numeric SANS NOT NULL ni CHECK conditionnel sur unit_type='weight' (SCHEMA.md produits ; aucune contrainte trouvée dans les migrations). La valorisation casse retombe à 0 si prix_drive_cents ET price_per_kg sont NULL : prix_vente_unitaire_eur=coalesce(...,0) (20260604000001) et prixUnitaire retourne 0 (casse.ts:158-160). Côté Drive, le prix vient de products.pri
- **Preuve :** SCHEMA.md produits : 'price_per_kg | numeric | -- | --' (pas de NOT NULL/CHECK) ; absence de contrainte unit_type='weight'→price_per_kg dans grep des migrations ; casse.ts:158-160 prixUnitaire retourn
- **Pourquoi ça compte :** Si un produit boucherie est créé sans price_per_kg (oubli backoffice), sa casse vaut 0€ dans le digest : Otmane croit 'pas de perte' alors qu'il y en a. Et le pilotage 'perte par catégorie' devient faux à la source. La confiance dans le chiffre de ca
- **Reco :** Ajouter une CHECK constraint (nouvelle migration horodatée) : unit_type<>'weight' OR price_per_kg IS NOT NULL. Et un écran /v2/admin de calibrage listant les produits au poids à price_per_kg NULL/0, à valider avant publication Drive. Court-terme : badge warning sur alertes-dlc si price_per_kg manqua

### Sorties 'perime_dlc' sans lot_id obligatoire → traçabilité halal non garantie
- **Catégorie :** anti-gaspi-dlc · **Effort :** S
- **Constat :** Vérifié : sorties_stock.lot_id est nullable (20260604000003:45-47, add column ... text references ... on delete set null) et il n'existe AUCUNE CHECK constraint exigeant lot_id IS NOT NULL pour type='perime_dlc'. consume_lot_fefo renvoie NULL si aucun lot suivi n'existe (fefo_lots.sql:108 commentaire explicite 'Renvoie NULL si aucun lot suivi'), et createSortie insère quand même la sortie avec lot
- **Preuve :** 20260604000003_fefo_lots.sql:45-47 (lot_id nullable) ; :103-110 (consume_lot_fefo renvoie NULL sans lot) ; lib/db/index.ts:486-505 (sortie insérée avec lot_id potentiellement null, try/catch non-fatal
- **Pourquoi ça compte :** Salamarket vend de la confiance halal premium ; la traçabilité lot/certificat est le 'moat' revendiqué (commentaire 20260530000000). Une sortie périmé non rattachée à un lot casse cette chaîne pour un audit AVS/ARGML. Mais en pratique, vu le bug pars
- **Reco :** À la déclaration d'une sortie type='perime_dlc', si consume_lot_fefo ne résout aucun lot, avertir le staff ('lot non tracé — scanner l'étiquette lot ?') plutôt que de bloquer dur (bloquer casserait le démarrage où tous les stocks n'ont pas de lots). Optionnel : CHECK constraint une fois la couvertur

### Écarts d'inventaire (démarque inconnue) jamais valorisés dans la casse
- **Catégorie :** anti-gaspi-dlc · **Effort :** M
- **Constat :** Vérifié et FONDÉ. completeInventaire (lib/db/index.ts:832-876) applique l'écart au stock via rpc adjust_stock avec p_type='inventaire' (index.ts:866-872) — l'ajustement va dans le ledger adjust_stock, PAS dans sorties_stock. Or les vues de casse (v_casse_baseline_28j, v_casse_pic_horaire, v_casse_digest_semaine) lisent EXCLUSIVEMENT sorties_stock WHERE type IN ('casse_manipulation','casse_client',
- **Preuve :** lib/db/index.ts:864-872 (delta inventaire → adjust_stock p_type='inventaire', pas de sorties_stock) ; 20260604000001_dlc_floor_and_casse_real_price.sql (vues casse : WHERE type IN 5 types de sortie, j
- **Pourquoi ça compte :** La démarque inconnue (différence inventaire) est souvent le plus gros poste de perte d'une épicerie. L'outil donne une fausse sérénité : digest '-200€ casse' stable, alors que la perte réelle inclut 50€/sem de manquants inventaire invisibles. Otmane 
- **Reco :** Quand un écart inventaire NÉGATIF est confirmé, créer une entrée sorties_stock type='demarque_inconnue' (type déjà existant depuis migration 0002) de la valeur de l'écart, pour qu'il remonte dans les vues casse. Alternativement, ajouter une ligne 'démarque inconnue (inventaire)' au dashboard casse p

### Pas de création de fournisseur en UI — /v2/fournisseurs ne fait qu'éditer, jamais créer
- **Catégorie :** onboarding-setup · **Effort :** M
- **Constat :** Vérifié et fondé. La table fournisseurs est richement enrichie par 0036 (email_commandes, lead_time_jours, min_commande_euros, franco_de_port, jours_livraison, certif halal). La page /v2/fournisseurs liste et ÉDITE des fournisseurs existants : son save() fait un sb.from('fournisseurs').update(...).eq('id', fournisseur.id) — c'est exclusivement un UPDATE sur un id existant. Aucun chemin de création
- **Preuve :** apps/stock/app/v2/fournisseurs/page.tsx:338-354 save() = .from('fournisseurs').update(...).eq('id', fournisseur.id) ; aucun .insert dans le fichier ; commentaire d'en-tête '/* Admin certifs halal */' 
- **Pourquoi ça compte :** Entrer ses 5-6 fournisseurs (avec contacts, lead times, franco, jours de livraison) est un prérequis de l'onboarding et de toute la supply chain (PO, prédiction rupture). Sans formulaire de création, l'admin est bloqué dès le premier setup et doit re
- **Reco :** Ajouter à /v2/fournisseurs un bouton 'Nouveau fournisseur' ouvrant le même éditeur en mode création (.insert) : nom, contacts, SIRET, lead_time_jours, min_commande_euros, franco_de_port, jours_livraison, certif halal. Mutualiser le formulaire d'édition existant.

### Import stock CSV ignore coût d'achat, fournisseur et TVA — marges fausses dès le jour 1
- **Catégorie :** onboarding-setup · **Effort :** S
- **Constat :** Vérifié et fondé. Le parser d'import catalogue (stock-import-parse.ts) ne reconnaît que 6 champs : ean, nom, marque, categorie, prix (prix_vente), quantite (KEYWORDS lignes 32-38). Aucun mot-clé pour cout/achat/prix_achat, fournisseur, ni tva. L'interface StockImportRow (ligne 12) ne porte que ces 6 champs. Un export Cashmag contenant les coûts d'achat verrait ces colonnes ignorées à l'import. Con
- **Preuve :** apps/stock/lib/cashbox/stock-import-parse.ts:12-19 (StockImportRow) et 32-39 (KEYWORDS : ean, nom, marque, categorie, prix, quantite) ; aucun mot-clé cout/achat/fournisseur/tva ; required = ['ean','no
- **Pourquoi ça compte :** L'import est la première action de l'onboarding et souvent la seule occasion d'injecter les coûts en masse. S'ils sont ignorés ici, Ahmed démarre avec une vision faussée de ses marges qu'il devra corriger produit par produit ailleurs (UI qui n'existe
- **Reco :** Enrichir KEYWORDS et StockImportRow avec colonnes optionnelles prix_achat (cout/achat/pa), fournisseur, tva. À l'import : écrire prix_achat dans produits_fournisseurs (est_principal) et résoudre/créer le fournisseur. Garder ces colonnes optionnelles pour ne pas casser les imports minimalistes.

### Rapport mensuel = Z fiscal, pas un P&L de gestion (ni COGS ni marge)
- **Catégorie :** aide-decision-kpi · **Effort :** M
- **Constat :** `computeMonthlyReport` calcule CA TTC/HT, TVA par taux, tickets, panier moyen, top produits, frais Stripe et net Drive. Il ne retourne JAMAIS de COGS, de marge brute €/%, ni de résultat par catégorie. La structure `MonthlyReport`/`MonthlySection` n'a aucun champ de coût. C'est une consolidation de chiffre d'affaires, pas un compte de résultat opérationnel — conséquence directe de l'absence de coût
- **Preuve :** apps/stock/lib/cashbox/monthly-report.ts: interface MonthlySection = {ca_ttc, ca_ht, tva_totale, nb_tickets, panier_moyen, top_produits}; drive ajoute {frais_stripe, net}. Aucun cogs/marge. La route /
- **Pourquoi ça compte :** Le compte de résultat de l'expert-comptable arrive avec 1-2 mois de retard. L'outil devrait donner à Ahmed une marge brute à J+1 (« hier 850€ CA, ~150€ marge brute, net 136€ »). Sans marge, le dashboard montre de l'activité mais ne dit pas si le comm
- **Reco :** Une fois le coût d'achat disponible (constat 1), enrichir MonthlyReport: cogs, marge_brute_eur, marge_brute_pct, et une ventilation marge par catégorie. Ajouter un flag « marge brute < seuil » dans le CSV. Tant que le coût n'existe pas, afficher explicitement « marge non calculable (coût d'achat man

### prix_vente non garanti en réception + pas d'historique de démarque DLC chiffrée
- **Catégorie :** coherence-donnees · **Effort :** M
- **Constat :** `stock_par_depot.prix_vente` est nullable, sans default, et la création de stock en réception ne garantit pas son remplissage — d'où un risque de valorisation à 0 sur les lots non synchronisés. La migration 20260608000005 a bien ajouté `prix_vente_avant_remise`/`remise_dlc_pct`/`demarque_at` (snapshot idempotent et réversible), ce qui CORRIGE l'affirmation de l'expert « aucun snapshot du prix orig
- **Preuve :** SCHEMA.md:291 prix_vente numeric, nullable, no default. Migration 20260608000005_stock_remise_dlc.sql ajoute prix_vente_avant_remise (snapshot) — donc le snapshot EXISTE désormais. Pas de table stock_
- **Pourquoi ça compte :** Ahmed veut « combien j'ai perdu en démarque DLC ce mois » (impact résultat) et une valeur de stock fiable. Le snapshot existe maintenant, mais sans agrégation au reporting ni garantie de prix_vente non nul à la réception, certains lots restent valori
- **Reco :** 1) Garantir prix_vente à la création du stock (copier depuis produits.prix_drive_cents/100 ou price_per_kg si NULL). 2) Agréger la démarque DLC du mois (Σ quantité × remise) dans monthly-report comme ligne « démarque DLC ». Pas besoin de table d'historique dédiée — réutiliser prix_vente_avant_remise

### Aucun export FEC ni écriture comptable normée
- **Catégorie :** fiscal-conformite · **Effort :** M
- **Constat :** Le rapport mensuel s'exporte en JSON/PDF/CSV de gestion (CA, TVA, top produits) mais il n'existe AUCUN export au format FEC (Fichier des Écritures Comptables, obligatoire art. A47 A-1 LPF en cas de contrôle). Aucune route, aucun fichier ne mappe les ventes à des comptes (701/707), codes journaux ou numéros d'écriture. Vérifié: répertoire app/api/cashbox ne contient aucune route 'fec', et le CSV me
- **Preuve :** find apps/stock/app/api/cashbox: monthly-report{,-pdf,-csv}, daily-z{,-pdf,-csv}, import-{stock,cashmag}, bon-reception-pdf — aucun fec. Aucun grep 701/702/JournalCode/EcritureNum dans le code (seuls 
- **Pourquoi ça compte :** Une épicerie soumise à la TVA doit pouvoir produire un FEC conforme sur demande de l'administration. Aujourd'hui l'expert-comptable doit reformater à la main le CSV de gestion, et un contrôle fiscal sans FEC exploitable expose à un rejet de comptabil
- **Reco :** Créer /api/cashbox/monthly-report-fec (CSV tab/pipe conforme: JournalCode=VE, JournalLib, EcritureNum=numéro commande/ticket, EcritureDate, CompteNum 707xxx par taux TVA + 4457xx TVA collectée, EcritureLib, EcritureDeb/Cred). S'appuyer sur les ventes Drive + import Cashmag déjà agrégés par taux.


## CONFORT

### Marges labo théoriques et isolées — aucune consolidation marge labo vs retail
- **Catégorie :** marge-rentabilite · **Effort :** S
- **Constat :** Vérifié : le labo expose des marges (lib/db/labo.ts : marge_eur_ht/pct, marge_eur_total, marge_pct_moyenne) MAIS calculées sur le coût des inputs saisis à la production (productions_inputs.cout_unitaire_ht) et la main d'œuvre — c'est une marge théorique de production, jamais croisée avec les ventes réelles (commandes_drive/cashmag). Aucune vue consolide labo% vs retail%. Le rapport mensuel ne ment
- **Preuve :** apps/stock/lib/db/labo.ts:55-84 (cout_matieres/indirects/total, marge_eur_ht, marge_eur_total, marge_pct_moyenne) — alimenté par productions_inputs.cout_unitaire_ht (commentaire :37-38, :139). monthly
- **Pourquoi ça compte :** Ahmed veut savoir quel segment (labo transformé vs revente) est le plus rentable pour décider où investir. Sans vue consolidée, le poids de marge global reste inconnu.
- **Reco :** 1. Ajouter une section 'marges par segment' au rapport mensuel (labo €/% via v_productions_kpi, retail €/% une fois le coût retail dispo, global pondéré). 2. Effort S si on réutilise l'existant labo, mais la partie retail dépend des constats coût (1/2/6).

### Aucun KPI « marge par jour » — le trend ne montre que le CA, pas la rentabilité
- **Catégorie :** aide-decision-kpi · **Effort :** M
- **Constat :** Vérifié : listRevenueByDay renvoie uniquement { date, particulier, pro } à partir de prix_unitaire × quantite (CA pur), aucune marge. Le dashboard l'utilise pour RevenueChart (CA particulier/pro 7/30/90j) ; aucun MarginChart. Donc impossible de voir une tendance de rentabilité ou de détecter une érosion de marge à CA stable. Constat exact ; sévérité 'confort' raisonnable (c'est un plus opérationne
- **Preuve :** apps/stock/lib/db/index.ts:1129-1180 — listRevenueByDay : signature retourne particulier/pro, calcul b.particulier/b.pro += prix_unitaire×quantite, aucune notion de coût/marge. Dashboard page.tsx:112 
- **Pourquoi ça compte :** Une baisse de marge à CA constant (prix qui baissent, coûts qui montent) est invisible aujourd'hui. Un trend de marge journalier détecterait ces dérives tôt, sans attendre le rapport mensuel.
- **Reco :** 1. Ajouter listMarginByDay() : date + marge_eur + marge_pct (CA ligne - quantite × cout_ref_ht). 2. MarginChart en dual-axis avec le CA. 3. Optionnel : alerte 'marge j-1 < seuil'. Dépend du coût (constats 1/2).

### reference_id sans FK et DELETE de sortie possible → trace d'audit cassable
- **Catégorie :** coherence-donnees · **Effort :** M
- **Constat :** PARTIELLEMENT FONDÉ mais sur-vendu. Vrai : reference_id est un text libre sans FK (impossible d'en mettre une, le champ est polymorphe — il pointe sortie/réception/transfert/commande Drive selon le type). Vrai : un DELETE sur sorties_stock existe dans le code. MAIS l'expert a manqué le contexte : ce DELETE (index.ts:527) est une transaction de COMPENSATION déclenchée UNIQUEMENT quand adjust_stock 
- **Preuve :** migration 0002:40 (reference_id text, pas de FK). lib/db/index.ts:512-529 : le delete sorties_stock est dans le catch de l'échec adjust_stock (rollback compensatoire), pas une suppression libre. Aucun
- **Pourquoi ça compte :** L'absence de visualisation du ledger (page audit) prive réellement Ahmed d'un outil pour expliquer une variation ('pourquoi -50 poulets ?'). Mais le risque d'orphelin par DELETE est quasi inexistant tel que le code se comporte aujourd'hui.
- **Reco :** Prioriser la valeur réelle : créer une page admin 'Mouvements de stock' qui liste stock_movements avec jointure best-effort sur le document source (par reference_id parsé) — c'est l'aide à la décision manquante. La FK est techniquement impossible (champ polymorphe) ; à la place, garder l'invariant '

### Seuil minimum de commande (min_commande_euros) jamais appliqué → micro-POs refusables
- **Catégorie :** achats-fournisseurs · **Effort :** S
- **Constat :** min_commande_euros est saisi par fournisseur mais aucun contrôle n'empêche l'auto-PO de générer un brouillon en-dessous du minimum. Résultat: brouillons qu'un fournisseur refusera, ou franco de port non atteint, ou temps staff gâché.
- **Preuve :** VÉRIFIÉ avec correction. min_commande_euros (et franco_de_port) sont sur fournisseurs (20260530000005_purchase_orders.sql:31-32), pas produits_fournisseurs ligne 52 comme cité. Dans auto-generate, min
- **Pourquoi ça compte :** Un brouillon à 30€ chez un fournisseur à minimum 500€ est mort-né; le franco_de_port (port offert au-dessus d'un seuil) est aussi ignoré, donc des frais de port évitables. Correctif simple, gain de crédibilité immédiat en démo.
- **Reco :** Avant insertion du PO: si total_ht < min_commande_euros du fournisseur, ne pas créer le brouillon mais consigner la ligne en 'candidats sous minimum' (raison affichée) pour qu'Otmane combine. Idéalement aussi signaler quand total_ht < franco_de_port.

### Création de PO brouillons par l'algo non notifiée (lignes bloquées certif comprises)
- **Catégorie :** aide-decision-kpi · **Effort :** S
- **Constat :** Quand l'auto-PO crée des brouillons (et surtout quand des lignes sont BLOQUÉES pour certif halal expirée), aucune notification push/email ne prévient Otmane. Il doit aller voir /v2/po manuellement. Un blocage certif peut passer inaperçu plusieurs heures.
- **Preuve :** PARTIELLEMENT VÉRIFIÉ — à nuancer. route.ts:450-468 retourne blocked_lines en JSON sans aucun push/Resend. MAIS le constat 'zéro notification' est trop fort: le cron forecast (apps/stock/app/api/cron/
- **Pourquoi ça compte :** Le vrai trou est la ligne bloquée pour certif halal: c'est précisément le 'moat' halal, et c'est l'info la plus urgente (produit non commandable). Qu'elle reste invisible jusqu'à ce qu'Otmane ouvre la page est le risque réel; la simple création de br
- **Reco :** Quand auto-generate retourne blocked_count>0, pousser une notif/email prioritaire ('1 produit non commandable: certif fournisseur expirée'). Pour les brouillons ordinaires, un résumé est un nice-to-have car les ruptures sont déjà couvertes par runForecastPushRules.

### Horizon de couverture (10j) global et indépendant du lead time réel du fournisseur
- **Catégorie :** achats-fournisseurs · **Effort :** S
- **Constat :** L'horizon de couverture cible (HORIZON_BASE_JOURS=10) et le lead utilisé dans le seuil (LEAD_DEFAULT=3) sont des constantes globales. Le boost d'horizon dépend uniquement du mode hijri, jamais du lead réel du fournisseur — un fournisseur lent sous-couvre, un fournisseur rapide sur-stocke.
- **Preuve :** VÉRIFIÉ. route.ts:57-58 HORIZON_BASE_JOURS=10, HORIZON_CAP_JOURS=35 en dur. route.ts:105-108 horizonCible=min(cap, base×seasonalBoost) où seasonalBoost ne dépend que du mode hijri (route.ts:97-104). P
- **Pourquoi ça compte :** Le dimensionnement du besoin est faux pour tout produit dont le lead réel diffère de 3j: un fournisseur à 7j génère des ruptures structurelles. C'est une logique métier incorrecte (pas juste un manque), même si l'impact dépend de la dispersion des le
- **Reco :** Résoudre le lead par produit AVANT la boucle de candidats et l'utiliser dans seuilDecl et besoin (couverture = max(base, lead×facteur)). Optionnellement rendre l'horizon paramétrable par fournisseur. Aligner le code sur le commentaire d'en-tête qui décrit déjà ce comportement.

### Minimum 15 € : double validation panier/checkout, message abrupt si re-déclenché
- **Catégorie :** drive-conversion-confiance · **Effort :** S
- **Constat :** Vérifié : Cart.tsx:692-722 affiche un bandeau de progression « Plus que X € pour valider » + bouton disabled si subtotal < 1500, et Checkout.tsx:96-114 a un guard qui redirige vers /panier avec toast « Commande minimum 15 € » si guardSubtotal < MIN_ORDER_CENTS. Le re-déclenchement est plausible mais marginal, et l'expert a raté la vraie cause de divergence : le subtotal panier (Cart.tsx:68-82) INT
- **Preuve :** apps/drive/src/pages/Cart.tsx:692-722 (bandeau+disabled) ; apps/drive/src/pages/Checkout.tsx:96-114 (guard redirect) ; divergence subtotal Cart (avec DLC) vs guardSubtotal Checkout (sans DLC)
- **Pourquoi ça compte :** Friction juste avant paiement = abandon. Marginal en pratique (panier déjà bloqué à <15 €), mais le seul angle mort réel est le toast sec côté checkout si la divergence DLC fait passer le seuil.
- **Reco :** Unifier le calcul de subtotal entre Cart et Checkout (même fonction, même traitement DLC) pour éliminer la divergence. Si le guard checkout doit fire, remplacer le toast+redirect par un retour panier avec le bandeau de progression déjà existant, plutôt qu'un toast d'erreur.

### Minimum de commande 15 € codé en dur, non pilotable par le gérant
- **Catégorie :** aide-decision-kpi · **Effort :** S
- **Constat :** Vérifié : MIN_ORDER_CENTS = 1500 est une constante en dur dans apps/drive/src/lib/constants.ts:10, importée par Cart.tsx:23 et Checkout.tsx:22. Aucune valeur en DB, aucun knob admin. Pour changer le seuil, il faut éditer le code et redéployer Drive. Ni Ahmed ni Otmane ne peuvent ajuster ce minimum (saison, promo, marge) sans développeur, ni vérifier la règle active en prod. Vraie lacune d'outil de
- **Preuve :** apps/drive/src/lib/constants.ts:10 (const en dur) ; apps/drive/src/pages/Cart.tsx:23 + Checkout.tsx:22 (imports) — aucune référence DB
- **Pourquoi ça compte :** Un gérant attend de piloter ses règles commerciales (minimum de commande) sans toucher au code. Tant que c'est en dur, l'app n'est pas un vrai outil de gestion sur ce point — mais c'est du confort, pas un bloqueur démo.
- **Reco :** Option légère : table business_settings (key/value) seedée avec min_order_cents, fetchée par Drive (React Query, cache 1h) avec fallback 1500, exposée dans le cockpit admin Stock. Minimal pour la démo : laisser en dur mais le documenter dans un ADR. Ne pas sur-ingénierer une table générique de règle

### tva_taux non envoyé à l'INSERT ligne : relu depuis products à la création (cas de bord)
- **Catégorie :** b2b-pro · **Effort :** S
- **Constat :** Partiellement fondé mais bénin. L'expert a raté que le snapshot TVA EXISTE déjà : proCart.ts stocke product_tva_taux dans chaque ligne au moment de l'ajout (persisté localStorage), et le panier affiche le TTC avec ce taux figé (Panier.tsx:67,178). Sa reco 'capturer product_tva_taux dans le store' est donc déjà faite. Le défaut résiduel réel : à l'INSERT, Panier.tsx:242-248 n'envoie PAS tva_taux, d
- **Preuve :** /Users/mac/salamarket/apps/drive/src/stores/proCart.ts (product_tva_taux dans le snapshot) ; /Users/mac/salamarket/apps/drive/src/pages/pro/Panier.tsx:242-248 (rows sans tva_taux) ; trigger set_ligne_
- **Pourquoi ça compte :** Le risque de litige existe mais est marginal (fréquence quasi nulle d'un changement de taux pile pendant une session panier). Le vrai écart entre l'expert et le code est qu'il croit le snapshot absent alors qu'il est présent.
- **Reco :** Quick win : ajouter tva_taux: l.item.product_tva_taux dans les rows de l'INSERT (Panier.tsx:242-248). Le trigger ne remplit déjà que si NULL, donc la valeur client prime sans casser la compat. Effort minime.

### Rapport mensuel : ré-agrégation Cashmag sans re-validation des montants en base
- **Catégorie :** fiscal-conformite · **Effort :** S
- **Constat :** parseCashmagCsv rejette bien à l'import les lignes à prix TTC négatif ou quantité ≤ 0 (surfacées dans l'UI). MAIS computeMonthlyReport relit ventes_cashmag_import (SELECT *) et multiplie qty × prix_ttc en brut, sans re-valider. Toute ligne déjà en base avec un montant aberrant (insert direct PostgREST, import via une autre voie, donnée corrompue) fausse silencieusement le CA mensuel.
- **Preuve :** apps/stock/lib/cashbox/cashmag-parse.ts:196-214 (rejet ttc<0 et qty<=0 au parsing). monthly-report.ts:85-99 et 168-178 : Number(row.prix_ttc) * qty sans aucun garde-fou, ht fallback ttc/1.055 si prix_
- **Pourquoi ça compte :** Un CA mensuel faux fausse la déclaration TVA et la décision de gestion. NUANCE vs l'expert : la porte d'entrée principale (parseCashmagCsv) est déjà gardée, donc le scénario 'CSV avec qty=10 prix=-5' décrit par l'expert est en réalité BLOQUÉ à l'impo
- **Reco :** Au moment de l'agrégation (monthly-report.ts) filtrer/logger toute ligne avec prix_ttc<0 ou quantite<=0 plutôt que de l'additionner en silence. Coût quasi nul, ferme la dernière fuite.

### Deux représentations des commandes Drive (orders vs commandes_drive) — risque sur exports ad hoc
- **Catégorie :** coherence-workflow · **Effort :** M
- **Constat :** Les commandes Drive au poids sont créées directement dans commandes_drive (bypass de orders), confirmé par WORKFLOW.md:313-315 ('ces commandes vivent uniquement dans commandes_drive'). orders ne contient donc qu'un sous-ensemble (commandes unit legacy). Un export/requête fait sur orders manquerait les ventes au poids.
- **Preuve :** WORKFLOW.md:291-315 (sync forward orders→commandes_drive + note bypass au poids). daily-z.ts:98 et monthly-report.ts:108 lisent commandes_drive (PAS orders). WORKFLOW.md:409 'orders = commandes legacy
- **Pourquoi ça compte :** Risque réel uniquement pour qui requête orders à la main en pensant y trouver tout le CA. NUANCE MAJEURE vs l'expert : les rapports fiscaux/analytics du produit (daily-z, monthly-report) lisent DÉJÀ commandes_drive, qui EST la source de vérité — le s
- **Reco :** Documenter explicitement dans SCHEMA.md que commandes_drive est LA source de vérité Drive et orders un vestige Checkout legacy. Éventuellement une vue v_commandes_drive_completes pour les exports. Pas urgent.

### Inventaire tournant : historique existant mais pas d'analyse de dérive ni d'escalade
- **Catégorie :** fiabilite-stock · **Effort :** M
- **Constat :** Contrairement à ce que sous-entend l'expert, un écran d'historique inventaire EXISTE (/v2/inventaire/historique) : il regroupe les comptages par jour avec les écarts. Ce qui manque réellement, c'est l'AGRÉGATION par produit sur N jours ('produit X dérive de 12% en moyenne'), un tableau 'produits à risque' et un seuil d'escalade (ex. <90% trois fois en 7j).
- **Preuve :** apps/stock/app/v2/inventaire/historique/page.tsx:99-177 (regroupement par date, calcul écarts par ligne) — l'historique existe. Aucune vue d'agrégation par produit/catégorie ni route d'escalade (grep 
- **Pourquoi ça compte :** Le gérant est alerté ponctuellement mais ne voit pas les dérives systémiques (vol récurrent, démarque cachée) produit par produit. L'outil avertit mais n'aide pas à piloter la correction dans la durée. NUANCE : l'expert a manqué l'écran historique ex
- **Reco :** Ajouter une vue v_conformite_inventaire (30j, écart moyen % par produit) et un onglet 'Dérive' sur la page historique existante (réutiliser le composant), plus une alerte escalade si même produit <90% 3× en 7j.

### Capacité de prépa staff invisible au cockpit — alors que la vue présence existe déjà
- **Catégorie :** coherence-workflow · **Effort :** M
- **Constat :** PARTIELLEMENT RÉFUTÉ sur la reco. L'expert propose de 'créer' une vue v_staff_present_today — or elle EXISTE déjà : v_staff_presents (migration 0038:190-212) renvoie qui est présent, état (en_service/en_pause), fin_prevue, anomalie. Le tort de l'expert ('table employes sans present_today') ignore que le pointage couvre exactement ça. Le constat RÉSIDUEL valable : cette vue n'est JAMAIS consommée p
- **Preuve :** 20260530000007_staff_pointage.sql:190-212 (v_staff_presents existe, complète) ; grep v_staff_presents dans apps/stock → uniquement lib/types/staff-pointage.ts, AUCUN composant/route cockpit ; Pilotage
- **Pourquoi ça compte :** La demande Drive surge à 12h/17h. Rapprocher commandes en cours et préparateurs présents aiderait à éviter les retards de retrait. Mais l'infra existe déjà (vue + helpers check-in/out) : c'est un travail d'intégration UI, pas de modélisation. Reste u
- **Reco :** Consommer v_staff_presents au cockpit : carte 'Capacité prépa' (N présents · ~capacité estimée vs commandes Drive en cours). Pas besoin de créer la vue (déjà là) ni de toucher employes. Surface les anomalies (retard/oubli) déjà calculées par les helpers.

### Briefing IA : timeout 6s et fallback brut jamais signalé à l'utilisateur
- **Catégorie :** reporting · **Effort :** S
- **Constat :** FONDÉ. reformulerViaIA a un timeout 6s (briefing/route.ts:292) ; en cas d'échec/timeout, fallback sur les bullets bruts du scoreur (briefing/route.ts:455-461) et un warning est poussé dans le payload. MAIS côté UI, MorningBriefCard n'affiche le badge 'Copilote' que si iaReformule===true (morning-brief.tsx:120-131) et n'affiche JAMAIS les warnings : le fallback est donc totalement invisible. Impact
- **Preuve :** briefing/route.ts:292 (timeout 6000ms) ; briefing/route.ts:455-461 (fallback + warnings.push) ; morning-brief.tsx:120-131 (badge Copilote ssi iaReformule) ; warnings du briefing jamais rendus dans mor
- **Pourquoi ça compte :** Question de transparence plus que de fiabilité : si l'IA tombe souvent, Ahmed croit lire un copilote alors qu'il lit des templates. Pas un risque de chiffre faux. Le fallback gracieux est en réalité une bonne pratique ; il manque juste l'indication d
- **Reco :** Réduire le timeout (3s) et afficher discrètement l'état dégradé (badge 'brut' ou retrait du badge Copilote suffit déjà). Mieux : précalculer le brief la nuit (cron 02-03h) pour éliminer le risque de latence à 8h. Logguer les timeouts pour tuning.

### prix_vente nullable dans stock_par_depot → valeur de stock partielle
- **Catégorie :** coherence-donnees · **Effort :** M
- **Constat :** prix_vente est nullable dans stock_par_depot et la valorisation fait prix_vente ?? 0 : tout produit sans prix_vente renseigné contribue 0€ à la valeur de stock affichée, sans signal. La valeur peut donc être silencieusement sous-évaluée si beaucoup de lignes ont prix_vente NULL.
- **Preuve :** SCHEMA.md:291 (prix_vente | numeric | -- | -- → pas de NOT NULL) ; pilotage.ts:125 (q * Number(s.prix_vente ?? 0)) ; admin/page.tsx:131 (prix_vente ?? 0). Le produit a pourtant prix_drive_cents (produ
- **Pourquoi ça compte :** Une valeur de stock silencieusement basse trompe le gérant, mais l'ampleur dépend du taux de NULL réel (inconnu sans données prod) et c'est le même axe que la lacune marge (#3). Impact modéré, pas un chiffre faux 'à coup sûr'.
- **Reco :** Soit rendre prix_vente NOT NULL (migration + backfill depuis produits.prix_drive_cents), soit calculer la valeur via une vue qui COALESCE stock_par_depot.prix_vente → produits.prix_drive_cents, et afficher un compteur 'N produits sans prix' comme signal de fiabilité.

### Recap WhatsApp affiche le CA mais pas la marge
- **Catégorie :** aide-decision-kpi · **Effort :** M
- **Constat :** La card Recap WhatsApp affiche CA jour, nb commandes Drive, CA magasin, alertes, réceptions, top produit — mais zéro indication de marge. Ahmed reçoit un CA brut sans savoir s'il a fait 5% ou 40% de marge. Factuel et correct, mais c'est le même manque racine que #3 (pas de coût d'achat).
- **Preuve :** WhatsAppRecapCard.tsx:16-30 (RecapData : ca_jour, drive_ca, magasin_ca... aucun champ marge) ; corps du message l.205-229 (aucune ligne marge).
- **Pourquoi ça compte :** Un CA sans marge n'oriente aucune décision. Mais tant que le coût d'achat n'existe pas (#3), aucun KPI marge n'est calculable ici — donc ce constat est une CONSÉQUENCE de #3, pas un défaut indépendant. À traiter avec #3, pas en parallèle.
- **Reco :** Une fois prix_achat disponible (#3), ajouter 'Marge brute estimée' au recap avec alerte si < seuil. Sans #3, rien à afficher. Fusionner ce point avec #3 plutôt que de le compter séparément.

### Vue KPI labo cassée — le fallback est en réalité PLUS à jour, pas un snapshot figé
- **Catégorie :** aide-decision-kpi · **Effort :** M
- **Constat :** La vue v_productions_kpi n'est appliquée par AUCUNE migration active (elle vit dans _archive/0025_productions_kpi.sql) et référence des colonnes 'quantite'/'prix_unitaire' qui ne correspondent pas au schéma réel (les tables ont quantite_reelle_consommee, cout_total, quantite_reelle_produite). Le code bascule donc systématiquement sur computeKpiFromTables(). MAIS le raisonnement du constat est INVE
- **Preuve :** apps/stock/lib/db/labo.ts:315-316 (viaView ?? computeKpiFromTables), 371-450 (recalcul live depuis tables) ; vue archivée _archive/0025_productions_kpi.sql:43-61 (colonnes quantite/prix_unitaire inexi
- **Pourquoi ça compte :** La marge atelier guide les décisions de prix d'Ahmed. La donnée n'est pas 'figée' (le constat se trompe), mais le taux TVA hardcodé à 5,5% peut fausser la marge HT sur des produits à 10%/20%.
- **Reco :** Soit aligner et appliquer v_productions_kpi en migration active, soit assumer le fallback comme chemin officiel et corriger le taux TVA : utiliser tva_taux réel du produit de sortie au lieu de 5,5% hardcodé. Supprimer la vue morte d'_archive pour éviter la confusion.

### Import CashMag : table sans CHECK, mais le parser rejette déjà les valeurs négatives
- **Catégorie :** fiscal-conformite · **Effort :** S
- **Constat :** Confirmé que la table ventes_cashmag_import n'a aucune CHECK sur quantite/prix_ht/prix_ttc et a une RLS permissive (anon INSERT). MAIS le constat affirme 'aucune validation d'import côté API' — c'est FAUX : le parser cashmag-parse.ts rejette explicitement les lignes avec prix_ttc<0 (l.198) et quantite<=0 (l.207) et les remonte comme erreurs au staff. Le scénario 'CSV corrompu avec quantite=-100 po
- **Preuve :** Parser : apps/stock/lib/cashbox/cashmag-parse.ts:196-208 (if ttc<0 → erreur ; if quantite<=0 → erreur). Table sans CHECK : _archive/0011_ventes_cashmag_import.sql:15-16, SCHEMA.md (RLS permissive anon
- **Pourquoi ça compte :** L'intégrité du Z/rapport mensuel compte pour la déclaration fiscale, mais le chemin d'import réel valide déjà. La défense en profondeur (CHECK SQL) reste souhaitable contre un INSERT hors-parser.
- **Reco :** Ajouter par sécurité défensive les CHECK (quantite>0, prix_ht>=0, prix_ttc>=0) en nouvelle migration horodatée, pour sceller au niveau base ce que le parser fait déjà côté applicatif. Optionnel : durcir la RLS anon INSERT.

### TVA non éditable par produit — dérivée de la catégorie, sans override possible
- **Catégorie :** fiscal-conformite · **Effort :** M
- **Constat :** Constat RÉAJUSTÉ : la prémisse 'TVA hardcodée à 5.5% par défaut' est partiellement RÉFUTÉE. lib/cashbox/tva.ts dérive le taux PAR CATÉGORIE (Traiteur/Boissons → 10%, Hygiène/Bazar → 20%, alimentaire → 5.5%) et le monthly-report/recap-fiscal l'utilise réellement (tvaRateForCategory). Donc tout n'est pas à 5.5%. MAIS le vrai défaut subsiste : (1) le taux n'est PAS éditable par produit (la table prod
- **Preuve :** apps/stock/lib/cashbox/tva.ts:17-47 (RATE_BY_CATEGORY + FOOD_5_5 + fallback 5.5) ; SCHEMA.md : table produits n'a pas de tva_taux, products l'a (ligne 255, default 5.5) ; trg_set_ligne_tva_taux copie 
- **Pourquoi ça compte :** Le taux par catégorie couvre les cas courants, donc le risque fiscal réel est plus faible qu'allégué. Mais sans override par produit, un cas particulier (produit atypique dans une catégorie générique) est mal taxé sans moyen de correction, ce qui peu
- **Reco :** Si besoin de finesse : ajouter tva_taux à produits (override optionnel) et l'exposer dans une éventuelle UI produit, en gardant tvaRateForCategory comme défaut. Sinon, documenter clairement la règle par catégorie pour Ahmed. Priorité moindre que les autres constats.

### Pas d'UI de configuration des dépôts — seedés en SQL, non éditables
- **Catégorie :** onboarding-setup · **Effort :** S
- **Constat :** Vérifié et fondé. Aucune page /v2/admin/depots ou équivalent (find *depot* sous app = vide). Les dépôts (Particulier, Professionnel, Sodrune, Salam Toulouse) sont créés en migrations (0001, 0030, 20260530000005). Le DepotSwitcher du V2Shell ne fait que sélectionner un dépôt existant. Renommer un dépôt ou en ajouter un (ex. dépôt 'Démo') exige du SQL. Impact limité pour un mono-magasin mais révèle 
- **Preuve :** find apps/stock/app -iname '*depot*' = vide ; table depots seedée en SQL (SCHEMA.md note 'Known depots ... fallback from 0030') ; pas de POST/PATCH dépôt.
- **Pourquoi ça compte :** Peu critique (K&A FOOD n'ajoutera sans doute pas de dépôt), mais un backoffice complet laisse l'admin nommer/configurer ses points de vente. C'est un signal de maturité plus qu'un blocage.
- **Reco :** Optionnel : page CRUD dépôts (nom, type point_vente/entrepot, adresse, is_active). À prioriser après employés/fournisseurs/coût d'achat.

### Édition fournisseur enregistre sans validation (email/URL) avant l'écriture en base
- **Catégorie :** onboarding-setup · **Effort :** S
- **Constat :** Vérifié et fondé. Le save() de l'éditeur fournisseur (/v2/fournisseurs) fait directement .from('fournisseurs').update(...) sans aucune validation préalable. Les inputs portent bien type='email' (ligne ~424) et type='url' (ligne ~550), MAIS ils ne sont PAS dans un élément <form> et le déclenchement passe par un <button type='button' onClick={save}>, ce qui COURT-CIRCUITE la validation HTML5 native 
- **Preuve :** apps/stock/app/v2/fournisseurs/page.tsx:338-354 save() = update direct sans garde ; inputs type='email'/'url' présents mais bouton type='button' onClick={save} (lignes ~424, ~550, ~573) hors <form> → 
- **Pourquoi ça compte :** Le suivi des certifs halal (Otmane) repose sur certif_pdf_url : une URL mal saisie rend le certificat illisible au moment de le présenter → risque de conformité halal. Pas bloquant pour Ahmed mais entame la fiabilité des données fournisseur.
- **Reco :** Valider avant save() : email via regex/Zod, URL via constructeur new URL() en try-catch ; toast.error et abandon si invalide. Réutiliser lib/validate/schemas.ts. Effort minime.

### Pas de comparaison de marge Drive vs Magasin
- **Catégorie :** marge-rentabilite · **Effort :** S
- **Constat :** Le rapport consolide Drive+Magasin et ne donne que la répartition du CA (`repartition.magasin_pct`/`drive_pct`), jamais la marge par canal. Mais c'est purement un corollaire du constat 2 : tant qu'il n'y a aucun coût d'achat, AUCUNE marge n'est calculable, ni globale ni par canal. Le distinguer comme constat séparé surévalue sa valeur — il n'apporte rien de plus à corriger une fois le COGS en plac
- **Preuve :** apps/stock/lib/cashbox/monthly-report.ts consolidation.repartition = {magasin_pct, drive_pct} (CA% uniquement). Pas de marge_*_pct. Même racine que constats 1-2.
- **Pourquoi ça compte :** Comparer la rentabilité des canaux est utile stratégiquement, mais c'est une vue secondaire qui découle mécaniquement du calcul de marge. Le présenter en forte-valeur distinct gonfle artificiellement le backlog ; la vraie priorité reste d'avoir UN co
- **Reco :** Ne pas en faire un chantier séparé. Une fois le COGS branché (constats 1-2), ajouter simplement deux colonnes marge_brute_pct (magasin / drive) à la consolidation existante — coût marginal quasi nul.

