// Génère une paire de clés VAPID pour Web Push.
// Usage : `node scripts/generate-vapid-keys.mjs`
// À ne lancer QU'UNE FOIS — les clés générées doivent être stockées
// en env vars (côté Lovable Cloud + Vercel/local) et NE JAMAIS être
// re-générées (sinon toutes les subscriptions existantes deviennent
// invalides).
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("\n— VAPID keys générées —");
console.log("\n# Variable Vite (frontend)");
console.log(`VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log("\n# Variables Edge Function (Lovable Cloud → Settings → Edge Functions)");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:contact@salamarket.fr   # adapter à ton email`);
console.log("\n⚠️  GARDE LA PRIVATE KEY SECRÈTE — ne JAMAIS la committer.\n");
