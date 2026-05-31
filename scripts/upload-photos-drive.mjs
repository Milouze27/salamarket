#!/usr/bin/env node
/**
 * upload-photos-drive.mjs — Re-upload des photos produits Salamarket Drive
 *
 * Contexte (BUG-015) :
 *   Les 4 produits seedés par la migration 0030 (IDs `00000000-0030-XXX`)
 *   pointaient vers des photos téléchargées depuis Unsplash random qui
 *   se sont avérées inappropriées pour un magasin halal :
 *     - Merguez Salam Maison → photo d'enseigne "Delle & Campbell's" avec
 *                              mention "Belgian Waffles" (hors sujet)
 *     - Poulet fermier entier → photo avec une bière Hoegaarden (HARAM)
 *     - Kefta Agneau / Brochettes Poulet → photos passables mais pas idéales
 *
 *   Ce script remplace ces 4 photos par les images locales propres déjà
 *   présentes dans apps/drive/public/products/*.webp (1254x1254 halal).
 *
 * Auth :
 *   Utilise SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL depuis
 *   /tmp/.env.stock-prod (env interne ops).
 *
 * Usage :
 *   node scripts/upload-photos-drive.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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
  console.error('FATAL: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in /tmp/.env.stock-prod');
  process.exit(1);
}

const BUCKET = 'product-images';

/**
 * Mapping :
 *   productId du seed 0030 → fichier local halal dans apps/drive/public/products
 *
 * Les 4 produits du seed migration 0030 dont les photos Unsplash sont
 * inappropriées. On les remplace par les .webp halal locaux. Le nom du
 * produit en commentaire = nom dans la table products.
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
    // Pas d'image "poulet entier" locale → on garde escalope-poulet
    // (closest halal substitute, pas de bière en arrière-plan)
    localFile: 'apps/drive/public/products/escalope-poulet.webp',
    targetPath: 'products/00000000-0030-0000-0000-000000000004.jpg',
  },
];

async function uploadFile({ productName, localFile, targetPath }) {
  const fullPath = resolve(REPO_ROOT, localFile);
  const data = readFileSync(fullPath);
  console.log(`[upload] ${productName} ← ${localFile} (${data.length} bytes)`);

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${targetPath}`;
  // POST = create, x-upsert: true = overwrite si existe
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: data,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload failed for ${productName}: HTTP ${res.status} — ${errText}`);
  }
  console.log(`[upload]   OK → ${BUCKET}/${targetPath}`);
}

async function updateProductImageUrl({ productId, productName, targetPath }) {
  // Bust cache navigateurs avec un v=timestamp query param. La table
  // products.image_url est lue tel quel par useProducts.ts, donc append
  // le ?v= force le re-fetch sur les clients déjà connectés.
  const cacheBust = `v=${Date.now()}`;
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${targetPath}?${cacheBust}`;

  const url = `${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ image_url: publicUrl }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PATCH products failed for ${productName}: HTTP ${res.status} — ${errText}`);
  }
  console.log(`[db]     OK ${productName} → ${publicUrl}`);
}

async function main() {
  console.log(`Re-upload ${REPLACEMENTS.length} photos halal vers ${SUPABASE_URL}`);

  for (const item of REPLACEMENTS) {
    try {
      await uploadFile(item);
      await updateProductImageUrl(item);
    } catch (err) {
      console.error(`[FAIL] ${item.productName}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('\nDone. Verify with:');
  console.log(`  curl -s "${SUPABASE_URL}/rest/v1/products?id=in.(00000000-0030-0000-0000-000000000001,00000000-0030-0000-0000-000000000002,00000000-0030-0000-0000-000000000003,00000000-0030-0000-0000-000000000004)&select=id,name,image_url" -H "apikey: \\$KEY" -H "Authorization: Bearer \\$KEY"`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
