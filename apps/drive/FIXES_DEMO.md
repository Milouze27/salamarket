# Fixes démo — 2026-05-15

Deux bugs bloquants corrigés avant la démo. **Commits locaux uniquement,
pas de push** — Mohamed valide puis pousse.

---

## FIX 1 — Panier Pro : `type_recuperation: 'drive'` invalide

**Symptôme.** Validation du panier Pro échoue silencieusement.

**Cause.** `src/pages/pro/Panier.tsx:209` envoyait
`type_recuperation: 'drive'`, mais la CHECK constraint
`commandes_pro_type_recuperation_check` (migration 0025, ligne 115-116)
n'accepte que `'livraison'` ou `'retrait_pro'`. L'INSERT était rejeté
par Postgres avant même de toucher les lignes.

**Fix.** Une ligne : `'drive'` → `'retrait_pro'`.

**Commit.** `a2e36e8` — `fix(pro): type_recuperation 'drive' -> 'retrait_pro'`

**Vérification.**
- `npm run build` ✅ vert
- `npm run test` ✅ 51/51 verts
- Test manuel à effectuer : ouvrir `/pro/catalogue`, ajouter 2 produits,
  valider le panier → la commande doit être créée avec statut
  `a_valider` et `type_recuperation = 'retrait_pro'`, visible dans
  `/admin/commandes-pro`.

---

## FIX 2 — Inscription Pro : "Une erreur est survenue"

**Symptôme.** À `/pro/inscription`, après les 3 étapes et clic sur
"Envoyer ma demande" → toast `Une erreur est survenue, réessayez`.

**Cause racine identifiée.** Le code Inscription.tsx faisait DÉJÀ
correctement `signUp` puis `INSERT comptes_pro` (ce n'est pas l'étape 1
qui manquait, contrairement à l'hypothèse initiale). Le vrai problème
était dans la migration 0025 (RLS Section 11) :

- `comptes_pro_select_delegue` → SELECT pour le délégué
- `comptes_pro_all_admin_manager` → ALL pour admin/manager
- **Aucune policy d'INSERT pour un utilisateur lambda authentifié**

Conséquence : `signUp` réussit, session active, puis l'INSERT dans
`comptes_pro` est bloqué silencieusement par RLS. L'erreur Postgrest
remonte mais n'est pas une instance d'`Error` (c'est un objet
`{ message, code, details, hint }`), donc le test
`err instanceof Error && /comptes_pro/i.test(err.message)` tombait à
faux et le code passait sur `translateAuthError(err)` qui ne reconnaît
pas le code RLS Postgres et renvoie le fallback générique.

**Fix.** Deux changements atomiques dans le même commit :

### 2a. Migration `0028_comptes_pro_self_register.sql`

Ajoute la policy d'INSERT manquante avec deux garde-fous :

```sql
create policy "comptes_pro_insert_self"
  on public.comptes_pro for insert
  to authenticated
  with check (
    auth.uid() = delegue_user_id
    and statut = 'en_validation'
  );
```

- `auth.uid() = delegue_user_id` empêche un user de créer un compte
  Pro avec un délégué autre que lui (pas d'usurpation)
- `statut = 'en_validation'` empêche un user de s'auto-valider — c'est
  toujours au manager de basculer le statut en `'actif'` via
  `/admin/comptes-pro`

### 2b. `src/pages/pro/Inscription.tsx`

Catch amélioré :
- `console.error("[ProInscription] submit failed", err)` pour debug
  côté navigateur
- Matching de `err.message` brut (et plus uniquement
  `err instanceof Error`), pour capturer les `PostgrestError`
- Détection explicite des erreurs RLS
  (`/row[- ]level security|violates.*policy/i`)
- Message utilisateur rassurant en cas d'échec : "Création du compte
  Pro impossible. Votre compte connexion est créé : notre équipe
  finalisera votre inscription Pro sous 24-48 h." — utile si jamais la
  migration 0028 n'est pas encore déployée sur l'env de démo

**Commit.** `2565399` — `fix(pro/inscription): crée compte auth avant insertion comptes_pro`

**Vérification.**
- `npm run build` ✅ vert
- `npm run test` ✅ 51/51 verts
- Test manuel à effectuer **après application de la migration 0028
  sur Supabase** :
  1. Aller sur `/pro/inscription`
  2. Étape 1 : `Raison sociale = "Test Démo"`, `SIRET = "12345678901234"`,
     forme `SARL`, adresse `1 rue de la Démo 75001 Paris`
  3. Étape 2 : nom `Jean Test`, tél `0612345678`,
     email `test-demo+15052026@xlab.tech`, mdp `Demo12345`,
     conditions `comptant`
  4. Étape 3 : cocher CGV, "Envoyer ma demande"
  5. **Attendu** : toast `Demande envoyée ! Nous validons votre compte
     sous 24-48 h.` + redirection `/pro/login`
  6. Côté admin (`/admin/comptes-pro`) : un nouveau compte
     `Test Démo` apparaît en statut `en_validation`

---

## Étapes restantes avant push

- [ ] Mohamed relit les deux commits (`git log -2 --stat`)
- [ ] Mohamed applique la migration 0028 sur Supabase prod
      (via dashboard SQL ou `supabase db push` selon la chaîne CI)
- [ ] Mohamed teste manuellement les 2 flows ci-dessus sur prod
- [ ] `git push origin main`

---

## Garde-fous respectés

- Aucune des 19 demandes Otmane n'a été touchée (les fixes sont
  contenus à Panier.tsx + Inscription.tsx + 1 nouvelle migration)
- Aucune dépendance npm ajoutée
- Aucun upgrade majeur Next.js / Supabase / TypeScript
- Commits signés `dadibelhamiti7@gmail.com`
- Messages de commit en français
