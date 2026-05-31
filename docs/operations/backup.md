# Backup & PITR — Salamarket DB

## État actuel

Le projet Supabase `tltmermqodelorthtbre` est hébergé sur Supabase Cloud.
À vérifier dans `Dashboard → Project Settings → Database → Backups` :

- **Daily Backups** : ON par défaut sur tous les plans payants.
  Plan Free : retention 7 jours. Plan Pro : retention 30 jours + PITR.
- **PITR (Point-In-Time Recovery)** : nécessite plan Pro ou supérieur.
  Permet de restaurer à une seconde près sur les 7-30 derniers jours.

## TODO opérationnel

1. **Vérifier** dans le dashboard que Daily Backups est bien activé.
2. **Si plan Free**, upgrade vers Pro pour PITR — coût marginal vs risque
   perte d'une journée de commandes / stock.
3. **Configurer un snapshot pg_dump hebdomadaire** stocké hors Supabase
   (S3 / GCS / Vercel Blob) via le script `scripts/db-snapshot.sh`. Cron
   conseillé : dimanche 03h Paris (off-peak).
4. **Tester un restore** sur un projet de staging au moins 1x par
   trimestre. Un backup non testé n'est PAS un backup.

## Restore manuel

### Daily backup (Supabase Dashboard)
1. `Dashboard → Backups → [select date] → Restore`
2. Cible : peut être ce projet (DANGER : écrase tout) ou un nouveau
   projet temporaire pour récupérer une table spécifique.
3. Une fois restauré, exporter la table via SQL Editor puis importer
   dans la prod.

### pg_dump snapshot (hors Supabase)
```bash
# Restore complet sur un projet staging
psql "$STAGING_DB_URL" < snapshot_2026_05_31.sql

# Restore d'une seule table (si on a fait des dumps par table)
pg_restore -d "$STAGING_DB_URL" -t produits snapshot_2026_05_31.dump
```

## RPO / RTO cibles

- **RPO (Recovery Point Objective)** : 1 heure max → impose snapshot horaire,
  pas possible sur Supabase Free. Sur Pro + PITR : RPO ~ 1 seconde.
- **RTO (Recovery Time Objective)** : 2 heures max → le restore Supabase
  Dashboard prend 5-15 min selon la taille. OK.

## Données à backuper en priorité (par valeur business)

1. `orders` + `commandes_drive` + `commandes_drive_lignes` (CA en cours)
2. `produits` + `stock_par_depot` (inventaire)
3. `receptions` + `receptions_lignes` (audit fournisseurs)
4. `sorties_stock` (audit casse + démarque)
5. `bons_de_livraison` (compta)
6. `employes` (RH)

## Plan B (catastrophe Supabase indisponible)

Le projet a un fallback local seed (`apps/stock/lib/db/seed-local.ts`)
qui permet à Stock de tourner en mode dégradé sans DB. Drive n'a pas
de fallback équivalent — en cas de panne Supabase prolongée, créer
une page maintenance et basculer manuellement le DNS.
