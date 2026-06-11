#!/usr/bin/env node
/**
 * upload-photos-drive.mjs — Gestion des photos produits Salamarket Drive
 *
 * Deux volets :
 *
 *  A) RÉCONCILIATION DONNÉES (`--reconcile`, ou par défaut)
 *     Corrige le décalage d'extension : les vraies photos produits ont
 *     bien été uploadées dans le bucket Storage `product-images/products/`
 *     sous la forme `<uuid>.jpg`, MAIS la table `products` référence pour
 *     ces produits un chemin LOCAL `/products/<slug>.webp` (servi depuis
 *     apps/drive/public, ce qui casse en prod). On repointe donc
 *     `products.image_url` vers l'URL Storage publique `<uuid>.jpg` dès
 *     qu'un objet `products/<id>.jpg` existe dans le bucket. Récupère
 *     immédiatement les ~12 vraies images sans rien re-uploader.
 *
 *  B) UPLOAD LOCAL → STORAGE (`--upload`)
 *     Re-upload de fichiers locaux (apps/drive/public/products/*) vers le
 *     bucket Storage + PATCH de products.image_url. Sert à publier les
 *     photos générées (cf. scripts/photo-prompts.md) pour les placeholders.
 *
 * Auth :
 *   SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL depuis
 *   /tmp/.env.stock-prod (env interne ops).
 *
 * Usage :
 *   node scripts/upload-photos-drive.mjs            # réconciliation (défaut)
 *   node scripts/upload-photos-drive.mjs --reconcile
 *   node scripts/upload-photos-drive.mjs --upload
 *   node scripts/upload-photos-drive.mjs --reconcile --upload
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// --- Charge env credentials ---
const envText = readFileSync('/tmp/.env.stock-prod', 'utf-8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx), l.slice(idx + 1)];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'FATAL: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in /tmp/.env.stock-prod',
  );
  process.exit(1);
}

const BUCKET = 'product-images';
const STORAGE_PREFIX = 'products';

const authHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
};

const MIME_BY_EXT = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

// ────────────────────────────────────────────────────────────────────
// VOLET A — Réconciliation données
// ────────────────────────────────────────────────────────────────────

/** Liste les objets `products/*` réellement présents dans le bucket. */
async function listStorageObjects() {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`,
    {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: STORAGE_PREFIX, limit: 1000 }),
    },
  );
  if (!res.ok) {
    throw new Error(`Storage list failed: HTTP ${res.status} — ${await res.text()}`);
  }
  return await res.json(); // [{ name: "00000000-...jpg", ... }]
}

/** Tous les produits avec leur image_url courante. */
async function listProducts() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=id,name,image_url`,
    { headers: authHeaders },
  );
  if (!res.ok) {
    throw new Error(`REST products failed: HTTP ${res.status} — ${await res.text()}`);
  }
  return await res.json();
}

async function patchImageUrl({ id, name, publicUrl }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ image_url: publicUrl }),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${name} failed: HTTP ${res.status} — ${await res.text()}`);
  }
}

async function reconcile() {
  console.log('— Volet A : réconciliation image_url ← Storage');
  const [objects, products] = await Promise.all([
    listStorageObjects(),
    listProducts(),
  ]);

  // Index des objets Storage par UUID (sans extension). Le bucket nomme
  // les fichiers `<uuid>.jpg` même quand le contenu réel est webp/png —
  // c'est le décalage d'extension qu'on accepte tel quel (l'objet existe,
  // l'URL répond, le navigateur sniffe le bon mimetype).
  const storageByUuid = new Map();
  for (const o of objects) {
    const base = o.name.replace(/\.[^.]+$/, ''); // retire l'extension
    storageByUuid.set(base, o.name); // ex "0a2aea7a-..." → "0a2aea7a-....jpg"
  }

  let fixed = 0;
  for (const p of products) {
    const fileName = storageByUuid.get(p.id);
    if (!fileName) continue; // pas d'objet Storage pour ce produit

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${STORAGE_PREFIX}/${fileName}`;
    const current = p.image_url || '';

    // Déjà aligné (même chemin Storage, hors cache-bust ?v=) → on saute.
    const currentNoQuery = current.split('?')[0];
    if (currentNoQuery === publicUrl) continue;

    // On ne touche QUE les entrées dont l'URL n'est pas déjà une URL
    // Storage publique de CE bucket (ex : chemin local /products/x.webp,
    // ou placeholder). Cela récupère les vraies photos déjà uploadées.
    const cacheBust = `v=${Date.now()}`;
    const finalUrl = `${publicUrl}?${cacheBust}`;
    try {
      await patchImageUrl({ id: p.id, name: p.name, publicUrl: finalUrl });
      console.log(`[fix] ${p.name}\n        ${current || '(vide)'}\n     →  ${finalUrl}`);
      fixed += 1;
    } catch (err) {
      console.error(`[FAIL] ${p.name}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\n${fixed} produit(s) repointé(s) vers le bucket Storage.`);
}

// ────────────────────────────────────────────────────────────────────
// VOLET B — Upload local → Storage (pour publier des photos générées)
// ────────────────────────────────────────────────────────────────────

/**
 * Mapping productId → fichier local + chemin cible Storage. Compléter ce
 * tableau au fur et à mesure que des photos sont générées (cf.
 * scripts/photo-prompts.md), puis lancer `--upload`.
 *
 * Les 4 entrées historiques (seed 0030, photos halal locales) sont
 * conservées : elles restent ré-uploadables si besoin.
 */
const REPLACEMENTS = [
  {
    productId: '00000000-0030-0000-0000-000000000001',
    productName: 'Merguez Salam Maison',
    localFile: 'apps/drive/public/products/merguez-maison.webp',
    targetPath: 'products/00000000-0030-0000-0000-000000000001.jpg',
  },
  {
    productId: '00000000-0030-0000-0000-000000000002',
    productName: 'Kefta Agneau',
    localFile: 'apps/drive/public/products/boulettes-boeuf.webp',
    targetPath: 'products/00000000-0030-0000-0000-000000000002.jpg',
  },
  {
    productId: '00000000-0030-0000-0000-000000000003',
    productName: 'Brochettes Poulet Marinées',
    localFile: 'apps/drive/public/products/escalope-poulet.webp',
    targetPath: 'products/00000000-0030-0000-0000-000000000003.jpg',
  },
  {
    productId: '00000000-0030-0000-0000-000000000004',
    productName: 'Poulet fermier entier',
    localFile: 'apps/drive/public/products/escalope-poulet.webp',
    targetPath: 'products/00000000-0030-0000-0000-000000000004.jpg',
  },
];

async function uploadFile({ productName, localFile, targetPath }) {
  const fullPath = resolve(REPO_ROOT, localFile);
  const data = readFileSync(fullPath);
  const mime = MIME_BY_EXT[extname(localFile).toLowerCase()] ?? 'image/jpeg';
  console.log(`[upload] ${productName} ← ${localFile} (${data.length} bytes, ${mime})`);

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${targetPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': mime,
      'x-upsert': 'true',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: data,
  });
  if (!res.ok) {
    throw new Error(`Upload failed for ${productName}: HTTP ${res.status} — ${await res.text()}`);
  }
  console.log(`[upload]   OK → ${BUCKET}/${targetPath}`);
}

async function updateProductImageUrl({ productId, productName, targetPath }) {
  const cacheBust = `v=${Date.now()}`;
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${targetPath}?${cacheBust}`;
  await patchImageUrl({ id: productId, name: productName, publicUrl });
  console.log(`[db]     OK ${productName} → ${publicUrl}`);
}

async function uploadAll() {
  console.log(`— Volet B : upload ${REPLACEMENTS.length} photo(s) locale(s)`);
  for (const item of REPLACEMENTS) {
    try {
      await uploadFile(item);
      await updateProductImageUrl(item);
    } catch (err) {
      console.error(`[FAIL] ${item.productName}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

// ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const doUpload = args.includes('--upload');
  const doReconcile = args.includes('--reconcile') || !doUpload;

  console.log(`Cible : ${SUPABASE_URL}\n`);

  if (doReconcile) await reconcile();
  if (doUpload) await uploadAll();

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
