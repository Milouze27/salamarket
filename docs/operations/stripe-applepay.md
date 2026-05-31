# Stripe Apple Pay / Google Pay — Setup Drive

> Wallets activés via `automatic_payment_methods: { enabled: true }` côté
> code (cf. `apps/stock/app/api/stripe/create-payment-intent/route.ts` +
> `supabase/functions/create-checkout-session/index.ts`).
> Le reste se passe côté Stripe Dashboard + hébergement statique.

## Checklist activation (1 fois en prod)

### 1. Dashboard Stripe — activer les wallets

1. https://dashboard.stripe.com/settings/payment_methods
2. Section **Wallets** → toggle :
   - [ ] **Apple Pay** : ON
   - [ ] **Google Pay** : ON
   - [ ] **Link** (Stripe) : ON (optionnel mais conv++ desktop)
3. Onglet **Card payments** → vérifier **3D Secure** = `automatique`.

### 2. Apple Pay — domain association

Apple Pay sur web (PWA Drive iOS) exige une preuve de possession du domaine.

1. Dashboard → **Settings → Payment methods → Apple Pay** → bouton
   **Add a new domain**.
2. Saisir : `salamarket-drive.vercel.app`
   (et `drive.salamarket.fr` quand le domaine custom sera cutover).
3. Stripe affiche un bouton **Download verification file**.
4. Déposer le fichier dans `apps/drive/public/.well-known/apple-developer-merchantid-domain-association`
   (sans extension, exactement ce nom). Le contenu = blob fourni par
   Stripe (~250 lignes base64).
5. Commit + déploiement Vercel.
6. Retour Dashboard → cliquer **Verify** → doit passer vert.

Vérification manuelle après deploy :
```bash
curl -I https://salamarket-drive.vercel.app/.well-known/apple-developer-merchantid-domain-association
# Doit retourner 200 OK + Content-Type: application/octet-stream ou text/plain
```

### 3. Vercel — servir le `/.well-known/`

Vercel sert nativement le dossier `public/` à la racine. Le fichier doit
donc être à :
```
apps/drive/public/.well-known/apple-developer-merchantid-domain-association
```

Aucune config `vercel.json` requise — Vite/Vercel inclut `public/`
automatiquement dans le build statique.

**Piège récurrent** : `.well-known` est masqué par `ls` (commence par
`.`). Vérifier avec `ls -la apps/drive/public/`.

### 4. Google Pay — pas de domain association

Google Pay sur web fonctionne dès que :
- Le site est en HTTPS (Vercel OK).
- Le toggle Dashboard est ON.
- Le visiteur est sur Chrome Android + a une carte sauvée dans
  Google Wallet.

Aucune action manuelle requise.

## Test après activation

### iPhone Safari (Apple Pay)

1. Sur iPhone, ouvrir `https://salamarket-drive.vercel.app` (ou installer
   en PWA via "Ajouter à l'écran d'accueil").
2. Ajouter un produit AU POIDS au panier (sinon flow = Checkout Session
   legacy, voir flow Drive vs Checkout dans WORKFLOW.md).
3. Aller jusqu'au paiement.
4. Dans le `<PaymentElement>`, un onglet **Apple Pay** doit apparaître
   en tête de liste.
5. Tap → confirmer avec Face ID / Touch ID.

### Android Chrome (Google Pay)

1. Même flow, sur Android Chrome avec compte Google + carte Wallet.
2. Onglet **Google Pay** doit apparaître.

### Desktop Chrome (Link)

L'onglet **Link** apparaîtra automatiquement si l'utilisateur a déjà un
compte Link Stripe sur ce navigateur. Sinon il sera proposé inline dans
le formulaire carte.

## Troubleshooting

| Symptôme | Cause probable | Fix |
|----------|----------------|-----|
| Apple Pay n'apparaît pas iPhone | Domain association KO ou non vérifié | Re-télécharger fichier Stripe, redéployer, re-cliquer Verify |
| `Domain verification failed` Dashboard | Fichier non servi en HTTPS / cache CDN stale | `curl -I` le fichier, `vercel --prod` rebuild |
| Google Pay absent Android Chrome | Toggle Dashboard OFF ou compte sans carte | Vérifier Dashboard + tester avec carte test 4242 dans Google Wallet |
| Wallets absents en local `localhost` | Normal : wallets HTTPS-only | Tester sur preview Vercel `*.vercel.app` |

## Refs code

- `apps/stock/app/api/stripe/create-payment-intent/route.ts` — flow Drive au poids (manual capture) — `automatic_payment_methods: { enabled: true }`.
- `supabase/functions/create-checkout-session/index.ts` — flow legacy 100 % unit (Stripe Checkout hosted) — omission de `payment_method_types`.
- `apps/drive/src/components/DriveStripePayment.tsx` — composant frontend, monte `<PaymentElement>` qui auto-render les wallets.
