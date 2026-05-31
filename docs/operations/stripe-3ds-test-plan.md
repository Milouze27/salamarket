# Stripe 3DS — Plan de test E2E avant démo

> 50 % des paiements FR exigent 3D Secure (SCA réglementation européenne).
> Une démo paiement où la modale 3DS ne s'affiche pas / ne revient pas =
> catastrophe perception.
> Ce plan doit être exécuté manuellement AVANT chaque démo Otmane / prod
> launch / migration de version Stripe.

## Cartes test Stripe (TEST MODE only)

| Numéro | CVC | Date | Comportement | Usage démo |
|--------|-----|------|--------------|-------|
| **4242 4242 4242 4242** | n'importe | future | Succès direct, AUCUN 3DS | Smoke test happy path |
| **4000 0027 6000 3184** | n'importe | future | 3DS **required** → modale Stripe → succès si on clique Complete | Test 3DS happy path |
| **4000 0082 6000 3178** | n'importe | future | 3DS required → échec si on clique Fail | Test 3DS user cancels |
| **4000 0000 0000 9995** | n'importe | future | `insufficient_funds` | Test error mapping FR |
| **4000 0000 0000 0002** | n'importe | future | `card_declined` (carte refusée) | Test error mapping FR |
| **4000 0000 0000 0069** | n'importe | future | `expired_card` | Test error mapping FR |
| **4000 0000 0000 0127** | n'importe | future | `incorrect_cvc` | Test error mapping FR |
| **4000 0000 0000 0119** | n'importe | future | `processing_error` Stripe | Test error mapping FR |

Doc Stripe complète : https://docs.stripe.com/testing#regulatory-cards

## Plan de test E2E manuel (15 min)

### Pré-requis

- [ ] `STRIPE_FORCE_TEST_MODE=1` set en prod (cf. instrumentation.ts).
- [ ] Vérifier dans Dashboard Stripe → en haut à droite tu vois bien
      "TEST DATA" en bandeau orange.
- [ ] Un compte client de test (mail + mdp) avec un produit AU POIDS
      dispo dans le catalogue (sinon flow = legacy Checkout, pas le
      PaymentIntent qu'on teste).

### Scénario 1 — Carte directe sans 3DS (happy path baseline)

1. Drive : ajouter au panier 1 produit AU POIDS (ex. mouton).
2. Sélectionner un créneau ≥ 1h dans le futur.
3. Aller jusqu'au paiement.
4. Saisir **4242 4242 4242 4242** / `12/34` / `123`.
5. Cliquer **Pré-autoriser X €**.
6. **Attendu** : redirect immédiat vers `/commande/confirmee/:id` sans
   modale 3DS.
7. Vérifier Dashboard Stripe → Payments → nouveau PaymentIntent en
   statut **Requires capture** (manual capture).

### Scénario 2 — Carte avec 3DS required (happy path SCA)

1. Re-faire un panier au poids.
2. Saisir **4000 0027 6000 3184** / `12/34` / `123`.
3. Cliquer **Pré-autoriser X €**.
4. **Attendu** : Stripe ouvre une modale "Authenticate your payment".
5. Cliquer **Complete authentication** dans la modale.
6. **Attendu** :
   - Redirect vers `/commande/confirmee/:id`.
   - Console browser : event log `stripe_3ds_redirect` (cf.
     `DriveStripePayment.tsx` onSubmit instrumentation).
   - Dashboard Stripe → PaymentIntent en **Requires capture**, avec
     "Authenticated via 3D Secure 2" en bas.
7. (Sentry connecté) : vérifier breadcrumb `stripe_3ds_redirect` arrivé.

### Scénario 3 — Carte avec 3DS et user CANCEL

1. Re-faire un panier au poids.
2. Saisir **4000 0082 6000 3178**.
3. Cliquer **Pré-autoriser**.
4. Dans la modale 3DS Stripe : cliquer **Fail authentication**.
5. **Attendu** :
   - PAS de redirect — on reste sur `/paiement`.
   - Message d'erreur FR sous le formulaire (cf. `stripe-errors-fr.ts`)
     du genre "Authentification 3D Secure échouée. Réessayez ou utilisez
     une autre carte."
   - Dashboard Stripe → PaymentIntent en **Failed** ou **Requires
     payment method**.
6. Vérifier que le client peut retenter avec **4242** sans recréer la
   commande (idempotence cf. `create-payment-intent` route bloc 2).

### Scénario 4 — Carte refusée (`card_declined`)

1. Re-faire un panier au poids.
2. Saisir **4000 0000 0000 0002**.
3. Cliquer **Pré-autoriser**.
4. **Attendu** :
   - Message FR : "Carte refusée. Vérifiez vos informations ou utilisez
     une autre carte." (cf. `apps/drive/src/lib/stripe-errors-fr.ts`).
   - PAS de message anglais "Your card was declined".
   - PaymentIntent Dashboard → Failed.

### Scénario 5 — Fonds insuffisants

1. Saisir **4000 0000 0000 9995**.
2. **Attendu** : message FR "Fonds insuffisants sur cette carte. Utilisez
   une autre carte ou réessayez plus tard."

### Scénario 6 — Apple Pay (iPhone Safari uniquement)

1. Sur iPhone Safari réel (pas simulateur — Apple Pay ne marche pas en
   simulateur).
2. Panier au poids → paiement.
3. **Attendu** : onglet **Apple Pay** apparaît en haut du
   `<PaymentElement>`.
4. Tap → Face ID → succès.
5. Vérifier Dashboard → PaymentIntent en Requires capture, payment_method
   contient `apple_pay`.

**Pré-requis** : Apple Pay domain association posée (cf.
`docs/operations/stripe-applepay.md`).

## Checklist pre-démo

- [ ] Scénarios 1 + 2 + 4 minimum passés (5 min).
- [ ] Carte client de prod préparée si on quitte le test mode (ex. pour
      démo cliente réelle live).
- [ ] Sentry connecté + breadcrumbs visibles (sinon `console.info` du
      browser fait foi).
- [ ] Apple Pay testé sur l'iPhone réel d'Otmane.

## Refs code

- `apps/drive/src/components/DriveStripePayment.tsx` — `onSubmit` log
  `stripe_3ds_redirect` quand `result.error === undefined` (= Stripe
  va rediriger pour 3DS ou succès direct).
- `apps/drive/src/lib/stripe-errors-fr.ts` — mapping code Stripe → FR.
- `apps/stock/app/api/stripe/create-payment-intent/route.ts` — bloc 2
  idempotence (réutilise PI existant si déjà autorisé).
