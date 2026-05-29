# CHECKIN_1 — Câblage <DriveStripePayment> au checkout

**Architecture finale (5 lignes)** :
```
Front Checkout.tsx → POST .../functions/v1/create-checkout-session  (Edge Function modifiée)
  ↳ si hasWeightLine : INSERT commandes_drive + lignes → return { commande_id }
  ↳ sinon (100% unit) : INSERT orders + Stripe Checkout hosted → return { checkout_url }
Front si commande_id ET hasWeightLine → monte <DriveStripePayment commandeId={…}>
<DriveStripePayment> → POST localhost:3000/api/stripe/create-payment-intent → clientSecret → confirmPayment
```

**Fichiers touchés** :
- `supabase/functions/create-checkout-session/index.ts` (+180 / −11). Détection `hasWeightLine`, calcul estimé serveur par unit_type, INSERT `commandes_drive` + `commandes_drive_lignes` avec `quantite_estimee` + `montant_estime_ttc`. Rollback étendu (`createdCommandeDriveId`).
- Aucune modif du frontend — `Checkout.tsx` et `<DriveStripePayment>` étaient déjà câblés pour ce contrat (cf. lignes 200-208 et 361-370 de Checkout.tsx, écrites pendant la mission précédente).
- Commit : `d21ae79`. Build vert (4,70 s).

**Hypothèses prises** :
1. **`products.id === produits.id`** (view mapping côté salam-stock, commit `779656f feat(view)`). Si faux → FK violation sur `commandes_drive_lignes.produit_id` → rollback automatique. À vérifier au check-in 2 quand on fait passer une vraie commande.
2. **Premier `depot` (ORDER BY created_at LIMIT 1)** comme `depot_id` par défaut. La table `depots` doit contenir ≥1 ligne en prod (sinon l'INSERT throw "Aucun dépôt configuré").
3. **`numero_commande` format `D2026-XXXXXXXX-NNN`** (timestamp ms + random 3 digits). Pas de séquence DB — risque très théorique de collision unique constraint, le retry frontend résout.
4. **`profiles.full_name`** utilisé pour `client_nom`. Fallback : email avant `@`. Si profil sans full_name ET sans email → "Client".

**Test manuel local** : ❌ pas encore lancé. Les 2 dev servers sont à démarrer pour Mission 3. Le câblage est cependant en cohérence avec ce qui était déjà écrit par les missions précédentes (frontend en attente du `commande_id` depuis ce commit).

**Risques résiduels** :
- Hypothèse 1 (products.id = produits.id) est le plus gros risque ; à valider end-to-end en Mission 3.
- L'Edge Function doit être **redéployée sur Supabase** pour que le frontend voie le nouveau comportement (`supabase functions deploy create-checkout-session`). À faire manuellement, **pas dans cette mission**.

**Status attendu Mission 1 : ✅ prêt pour ton OK avant Mission 2 (seeds SQL).**
