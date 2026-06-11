#!/usr/bin/env node
/**
 * coh01-sync-catalogue.mjs — Backfill data de COH-01.
 *
 * Applique le VOLET DONNÉES de la migration
 * 20260611000010_coh01_sync_produits_to_products.sql via le service_role
 * (PostgREST), faute de credentials `supabase db push` (pas de SUPABASE_DB_URL
 * ni de SUPABASE_ACCESS_TOKEN dans l'env de seed).
 *
 * Le VOLET DDL (fonction + trigger sync_produit_to_products) reste à appliquer
 * via `supabase db push` quand l'accès DB est dispo — c'est lui qui maintiendra
 * la cohérence EN CONTINU. Ce script ne fait QUE le backfill ponctuel :
 *   1. upsert toutes les `produits` visible_drive=true → `products`
 *      (mapping prix/cat/image/unité, in_stock=true).
 *   2. in_stock=false dans `products` pour les produits non visibles Drive.
 *
 * Idempotent. Usage : node scripts/coh01-sync-catalogue.mjs [--dry]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const env = Object.fromEntries(
  readFileSync('/tmp/.env.stock-prod', 'utf-8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (m) => console.log((DRY ? '[DRY] ' : '') + m);

(async () => {
  const { data: produits, error } = await sb
    .from('produits')
    .select('id,nom,description_drive,prix_drive_cents,drive_unit,drive_category,image_drive_url,unit_type,price_per_kg,estimated_weight_kg,poids_min_kg,poids_max_kg,visible_drive')
    .limit(2000);
  if (error) { console.error('read produits:', error.message); process.exit(1); }

  const visibles = produits.filter((p) => p.visible_drive === true);
  const masques = produits.filter((p) => p.visible_drive !== true);
  log(`produits: ${produits.length} total, ${visibles.length} visibles Drive, ${masques.length} masqués`);

  const rows = visibles.map((p) => ({
    id: p.id,
    name: p.nom,
    description: p.description_drive ?? '',
    price_cents: p.prix_drive_cents ?? 0,
    unit: p.drive_unit ?? 'piece',
    category: p.drive_category ?? 'epicerie',
    image_url: p.image_drive_url ?? '',
    in_stock: true,
    tva_taux: 5.5,
    unit_type: p.unit_type ?? 'unit',
    price_per_kg: p.price_per_kg,
    estimated_weight_kg: p.estimated_weight_kg,
    poids_min_kg: p.poids_min_kg,
    poids_max_kg: p.poids_max_kg,
    updated_at: new Date().toISOString(),
  }));

  if (DRY) {
    log(`would upsert ${rows.length} into products; would mask ${masques.length}`);
    return;
  }

  // 1) Upsert des visibles Drive.
  const up = await sb.from('products').upsert(rows, { onConflict: 'id' }).select('id');
  if (up.error) { console.error('upsert products:', up.error.message); process.exit(1); }
  log(`✓ upsert ${up.data.length} produits visibles → products`);

  // 2) Masquer dans products les produits non visibles Drive (sans delete, FK pro).
  const maskIds = masques.map((p) => p.id);
  if (maskIds.length > 0) {
    const mk = await sb.from('products').update({ in_stock: false, updated_at: new Date().toISOString() })
      .in('id', maskIds).eq('in_stock', true).select('id');
    if (mk.error) { console.error('mask products:', mk.error.message); process.exit(1); }
    log(`✓ ${mk.data.length} produits non visibles masqués (in_stock=false) dans products`);
  }

  // Verify.
  const { count: total } = await sb.from('products').select('id', { count: 'exact', head: true });
  const { count: inStock } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('in_stock', true);
  log(`VERIFY products: ${total} lignes total, ${inStock} in_stock=true`);
})();
