# Uptime Monitoring (Drive + Stock + Supabase)

Backlog ref : `obs-no-uptime-monitoring` (P1).

Pas de setup automatique (compte externe). À faire manuellement une fois pour toutes.

## Provider recommandé : Better Uptime

- https://betterstack.com/better-uptime
- **Free tier** : 10 monitors, check toutes les 3 minutes, alertes email + SMS (1 user free).
- Alternative équivalente : UptimeRobot (free, check toutes les 5 minutes seulement).

## 5 endpoints à monitorer

| # | Endpoint | Method | Expected | Interval |
|---|----------|--------|----------|----------|
| 1 | `https://salamarket-drive.vercel.app` | GET | 200 + body contient `<div id="root">` | 3 min |
| 2 | `https://salam-stock.vercel.app` | GET | 200 (redirige vers /login si pas auth, ça suffit) | 3 min |
| 3 | `https://salam-stock.vercel.app/api/health` | GET | 200 + JSON `{ "ok": true }` | 3 min |
| 4 | `https://tltmermqodelorthtbre.supabase.co/rest/v1/` | GET | 200 ou 401 (Supabase health endpoint répond toujours) | 5 min |
| 5 | `https://salam-stock.vercel.app/api/stripe/webhook` | OPTIONS | 200 ou 405 (juste vérifier que la route est mounted) | 5 min |

> Note : `/api/health` à créer dans Stock si pas encore présent. Route GET trivial qui retourne `{ ok: true, ts: Date.now() }` + check supabase ping.

## Contacts d'alerte

| Contact | Méthode | Trigger |
|---------|---------|---------|
| dadibelhamiti7@gmail.com (toi) | Email + SMS | Endpoint down > 2 checks consécutifs |
| Otmane (tel à compléter) | SMS uniquement | Endpoint Stock down > 5 min |

## Configuration step-by-step

1. https://betterstack.com/uptime — créer compte avec `dadibelhamiti7@gmail.com`.
2. **Monitors → Create monitor** pour chacun des 5 endpoints.
3. Pour chaque monitor :
   - **Request timeout** : 30s
   - **Maintenance windows** : aucun (24/7).
   - **Recovery period** : 1 check (back to up dès qu'un check passe).
   - **Confirmation period** : 2 checks (évite les fausses alertes sur 1 hiccup réseau).
4. **Settings → Notifications** :
   - Ajouter SMS (gratuit 1 user en free tier).
   - Tester l'envoi sur le tel.
5. **On-call rotation** : pas nécessaire au stade actuel (juste toi). À configurer si Otmane veut être on-call la nuit.

## Status page publique (optionnel)

Better Uptime offre une status page hébergée gratuite (sous-domaine `salamarket.betteruptime.com`). À considérer si on veut afficher la dispo aux clients B2B Pro.

## Coût total

- **Better Uptime free** : 0€/mois (10 monitors, 5 utilisés ici → marge OK).
- Si on dépasse : plan **Free → Starter** $20/mois pour 50 monitors + status page custom.
