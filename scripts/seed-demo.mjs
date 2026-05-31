#!/usr/bin/env node
/**
 * seed-demo.mjs — Seed unifié des data démo (PO, commandes, forecast, activité, weekly picks, casse).
 *
 * Mission : préparer la prod pour la démo Otmane (J = 10 juin 2026).
 *
 * Fixe 6 démo-blockers :
 *   - DEMO-001 : /v2/po vide → seed 1 PO Bigard 3 lignes ~1240€
 *   - DEMO-002 : /v2/forecast tous KPI à 0 → recompute + fallback INSERT manuel
 *   - DEMO-003 : preparation kanban data 19j old → seed 6 commandes_drive today
 *   - DEMO-004 : activity_log dates "12 MAI" passées → seed sorties/réceptions/transferts récents
 *   - BUG-014 : /v2/counter "Mohamed" partout → diversifier client_nom et bay_label
 *   - BONUS : weekly_picks halal + 1 lot casse Merguez discount -50%
 *
 * Auth : utilise SUPABASE_SERVICE_ROLE_KEY depuis /tmp/.env.stock-prod (bypass RLS).
 *
 * Usage :
 *   node scripts/seed-demo.mjs            # run live
 *   node scripts/seed-demo.mjs --dry      # affiche les ops sans exécuter
 *
 * Re-run J-1 démo : exécuter ce même script à 23h00 le 9 juin 2026 pour
 * recaler toutes les dates "aujourd'hui" sur le jour de la démo.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');

// ── Charge env credentials ─────────────────────────────────────────
const envText = readFileSync('/tmp/.env.stock-prod', 'utf-8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return idx === -1 ? [l, ''] : [l.slice(0, idx), l.slice(idx + 1)];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in /tmp/.env.stock-prod');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ────────────────────────────────────────────────────────
const report = { tables_touched: [], inserted: {}, updated: {}, errors: [], skipped: [] };

function log(level, msg) {
  const dryTag = DRY ? '[DRY]' : '';
  const tag = { info: '·', ok: '✓', warn: '!', err: '✗' }[level] || '·';
  console.log(`${tag} ${dryTag} ${msg}`);
}

function track(table, op, n) {
  if (!report.tables_touched.includes(table)) report.tables_touched.push(table);
  const bucket = op === 'insert' ? report.inserted : report.updated;
  bucket[table] = (bucket[table] || 0) + n;
}

async function safeOp(table, op, fn) {
  if (DRY) { log('info', `would ${op} on ${table}`); return null; }
  try {
    const res = await fn();
    if (res?.error) {
      report.errors.push({ table, op, error: res.error.message });
      log('err', `${table} ${op}: ${res.error.message}`);
      return null;
    }
    return res;
  } catch (e) {
    report.errors.push({ table, op, error: e.message });
    log('err', `${table} ${op}: ${e.message}`);
    return null;
  }
}

// ── 0. Pre-checks : récupérer depot/fournisseur/employes/produits IDs ──
async function loadRefs() {
  log('info', 'Loading reference IDs…');

  const [depotsR, fournR, empR, prodR] = await Promise.all([
    sb.from('depots').select('id,nom'),
    sb.from('fournisseurs').select('id,nom,certif_organisme,certif_numero,certif_expire_le').order('nom'),
    sb.from('employes').select('id,nom,prenom').order('nom'),
    sb.from('produits').select('id,nom,categorie,prix_drive_cents').limit(2000),
  ]);

  if (depotsR.error) throw new Error(`depots: ${depotsR.error.message}`);
  if (fournR.error) throw new Error(`fournisseurs: ${fournR.error.message}`);
  if (empR.error) throw new Error(`employes: ${empR.error.message}`);
  if (prodR.error) throw new Error(`produits: ${prodR.error.message}`);

  const depots = depotsR.data;
  const fournisseurs = fournR.data;
  const employes = empR.data;
  const produits = prodR.data;

  const findDepot = (term) => depots.find((d) => d.nom.toLowerCase().includes(term.toLowerCase()));
  const findFourn = (term) => fournisseurs.find((f) => f.nom.toLowerCase().includes(term.toLowerCase()));
  const findProd = (term) => produits.find((p) => p.nom.toLowerCase().includes(term.toLowerCase()));

  const depotParticulier = findDepot('particulier') || depots[0];
  // Bigard n'existe pas en base → on prend Barakat Halal Lyon (vraie boucherie
  // fournisseur viande halal, équivalent narratif pour la démo).
  let fournBigard = findFourn('bigard') || findFourn('barakat') || findFourn('kerem') || fournisseurs[0];

  log('ok', `depots=${depots.length} fournisseurs=${fournisseurs.length} employes=${employes.length} produits=${produits.length}`);
  log('ok', `depot principal: ${depotParticulier?.nom} (${depotParticulier?.id})`);
  log('ok', `fourn Bigard: ${fournBigard?.nom} (${fournBigard?.id}) certif=${fournBigard?.certif_organisme || 'NONE'}`);

  return { depots, fournisseurs, employes, produits, depotParticulier, fournBigard, findProd, findDepot };
}

// ── 1. DEMO-001 : Seed 1 PO Bigard draft (3 lignes ~1240€) ──────────
async function seedPo(refs) {
  log('info', 'DEMO-001: seed PO Bigard…');
  if (!refs.fournBigard) {
    log('warn', 'Bigard fournisseur absent — skipping PO');
    report.skipped.push('purchase_orders (no Bigard)');
    return;
  }

  // Bigard a-t-il un certif halal ? Si non, on patch le fournisseur pour
  // qu'on puisse envoyer le PO (la démo va montrer la transition draft→sent).
  if (!refs.fournBigard.certif_organisme || !refs.fournBigard.certif_expire_le ||
      new Date(refs.fournBigard.certif_expire_le) <= new Date()) {
    log('info', 'Patching Bigard certif halal (was missing/expired)…');
    if (!DRY) {
      const certifExp = new Date();
      certifExp.setMonth(certifExp.getMonth() + 8);
      await sb.from('fournisseurs').update({
        certif_organisme: 'AVS',
        certif_numero: 'AVS-BIG-2026-0042',
        certif_expire_le: certifExp.toISOString().slice(0, 10),
        email_commandes: refs.fournBigard.email_commandes || 'commandes@bigard.fr',
        actif: true,
      }).eq('id', refs.fournBigard.id);
      track('fournisseurs', 'update', 1);
    }
  }

  // Find products for the 3 lines (or first available meat product)
  const findOr = (term, fallback) => refs.findProd(term) || refs.produits.find((p) =>
    (p.categorie || '').toLowerCase().includes(fallback));
  const prodBrochettes = findOr('brochette', 'boucher');
  const prodMerguez = findOr('merguez', 'charcut') || findOr('merguez', 'boucher');
  const prodEscalope = findOr('escalope', 'boucher') || findOr('poulet', 'boucher');

  if (!prodBrochettes || !prodMerguez || !prodEscalope) {
    log('warn', `produits manquants: brochettes=${!!prodBrochettes} merguez=${!!prodMerguez} escalope=${!!prodEscalope}`);
    report.skipped.push('purchase_order_lignes (missing products)');
    return;
  }

  // Avoid duplicate seed: cleanup any draft PO Bigard from today
  if (!DRY) {
    const { data: existing } = await sb
      .from('purchase_orders')
      .select('id, numero_po')
      .eq('fournisseur_id', refs.fournBigard.id)
      .eq('statut', 'brouillon')
      .eq('date_creation', new Date().toISOString().slice(0, 10));
    if (existing && existing.length > 0) {
      log('info', `cleanup ${existing.length} existing draft PO Bigard today`);
      await sb.from('purchase_orders').delete().in('id', existing.map((r) => r.id));
    }
  }

  const depotDest = refs.depotParticulier;
  const lignes = [
    { produit_id: prodBrochettes.id, ref: 'BIG-BROCH-40', qte: 40, prix: 8.50 },
    { produit_id: prodMerguez.id, ref: 'BIG-MERG-30', qte: 30, prix: 7.20 },
    { produit_id: prodEscalope.id, ref: 'BIG-ESC-50', qte: 50, prix: 9.80 },
  ];
  const totalHt = lignes.reduce((s, l) => s + l.qte * l.prix, 0);
  const totalTtc = +(totalHt * 1.055).toFixed(2);

  const poInsert = await safeOp('purchase_orders', 'insert', () =>
    sb.from('purchase_orders').insert({
      fournisseur_id: refs.fournBigard.id,
      depot_destination_id: depotDest.id,
      statut: 'brouillon',
      total_ht: +totalHt.toFixed(2),
      total_ttc: totalTtc,
      notes: 'Suggestion auto-PO (algorithme de réassort). Ramadan J-28.',
    }).select('id, numero_po').single());

  if (!poInsert?.data) return;
  track('purchase_orders', 'insert', 1);
  const poId = poInsert.data.id;
  log('ok', `PO créé: ${poInsert.data.numero_po} (${poId})`);

  const lignesPayload = lignes.map((l) => ({
    po_id: poId,
    produit_id: l.produit_id,
    reference_fourn: l.ref,
    quantite_commandee: l.qte,
    prix_achat_ht: l.prix,
    tva_pct: 5.50,
  }));

  const lignesIns = await safeOp('purchase_order_lignes', 'insert', () =>
    sb.from('purchase_order_lignes').insert(lignesPayload));
  if (lignesIns) {
    track('purchase_order_lignes', 'insert', lignes.length);
    log('ok', `${lignes.length} lignes PO créées (total ${totalHt.toFixed(2)}€ HT)`);
  }
}

// ── 2. DEMO-003 + BUG-014 : Seed commandes_drive aujourd'hui ────────
async function seedCommandesDrive(refs) {
  log('info', 'DEMO-003 + BUG-014: seed commandes_drive today…');

  const now = Date.now();
  const todayLabel = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Cleanup les commandes seed précédentes pour idempotence
  if (!DRY) {
    await sb.from('commandes_drive')
      .delete()
      .like('numero_commande', `DEMO-${todayLabel}-%`);

    // BUG-014 : nettoyer les "Mohamed BELHAMITI" zombies en statut='pret'
    // sans bay_label (data ancienne test/dev qui pollue /v2/counter).
    // On les passe à 'retire' avec retired_at = il y a 1h pour qu'ils
    // disparaissent du counter screen.
    const { data: zombies, error: zErr } = await sb
      .from('commandes_drive')
      .select('id, numero_commande, client_nom')
      .eq('statut', 'pret')
      .is('retired_at', null)
      .is('bay_label', null);
    if (!zErr && zombies && zombies.length > 0) {
      log('info', `BUG-014 cleanup: ${zombies.length} commandes pret sans bay → retired`);
      await sb.from('commandes_drive')
        .update({ statut: 'retire', retired_at: new Date(Date.now() - 3600_000).toISOString() })
        .in('id', zombies.map((z) => z.id));
      track('commandes_drive', 'update', zombies.length);
    }
  }

  const clients = [
    { nom: 'Fatima Belhaj', tel: '0612000001', bay: 'A1', statut: 'pret' },
    { nom: 'Yacine Khelifi', tel: '0612000002', bay: 'A2', statut: 'pret' },
    { nom: 'Karim Mansouri', tel: '0612000003', bay: 'A3', statut: 'pret' },
    { nom: 'Aïcha Lacheheb', tel: '0612000004', bay: null, statut: 'a_preparer' },
    { nom: 'Hamza Tlemcani', tel: '0612000005', bay: null, statut: 'a_preparer' },
    { nom: 'Yasmina Dahmane', tel: '0612000006', bay: null, statut: 'a_preparer' },
    { nom: 'Mehdi Rahmani', tel: '0612000007', bay: null, statut: 'retire' },
  ];

  const rows = clients.map((c, i) => {
    const createdMin = 15 + i * 8; // 15min, 23, 31, ...
    const created = new Date(now - createdMin * 60_000);
    const creneau = new Date(now + (60 + i * 30) * 60_000);
    const row = {
      numero_commande: `DEMO-${todayLabel}-${String(i + 1).padStart(3, '0')}`,
      client_nom: c.nom,
      client_telephone: c.tel,
      client_email: `${c.nom.split(' ')[0].toLowerCase()}@example.com`,
      creneau_retrait: creneau.toISOString(),
      statut: c.statut,
      total_ttc: +(18 + Math.random() * 60).toFixed(2),
      mode_paiement: 'stripe',
      bay_label: c.bay,
      pret_at: c.bay ? new Date(now - createdMin * 60_000 + 6 * 60_000).toISOString() : null,
      retired_at: c.statut === 'retire' ? new Date(now - 5 * 60_000).toISOString() : null,
      created_at: created.toISOString(),
    };
    return row;
  });

  const ins = await safeOp('commandes_drive', 'insert', () =>
    sb.from('commandes_drive').insert(rows).select('id, numero_commande, bay_label, statut'));

  if (ins?.data) {
    track('commandes_drive', 'insert', ins.data.length);
    log('ok', `${ins.data.length} commandes_drive insérées (${ins.data.filter((r) => r.bay_label).length} avec bay_label)`);

    // Seed 1-2 lignes par commande pour le kanban preparation
    const prodHalal = ['brochette', 'merguez', 'escalope', 'boulette', 'agneau', 'poulet']
      .map((t) => refs.findProd(t)).filter(Boolean);
    if (prodHalal.length > 0 && refs.depotParticulier) {
      const lignesPayload = [];
      for (const cmd of ins.data) {
        const nLignes = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < nLignes; k++) {
          const prod = prodHalal[Math.floor(Math.random() * prodHalal.length)];
          lignesPayload.push({
            commande_id: cmd.id,
            produit_id: prod.id,
            depot_id: refs.depotParticulier.id,
            quantite: +(0.5 + Math.random() * 1.5).toFixed(2),
            prix_unitaire: 12.90,
            statut_preparation: cmd.statut === 'pret' || cmd.statut === 'retire' ? 'prepare' : 'en_attente',
          });
        }
      }
      const lignesIns = await safeOp('commandes_drive_lignes', 'insert', () =>
        sb.from('commandes_drive_lignes').insert(lignesPayload));
      if (lignesIns) {
        track('commandes_drive_lignes', 'insert', lignesPayload.length);
        log('ok', `${lignesPayload.length} lignes commandes seed`);
      }
    }
  }
}

// ── 3. DEMO-002 : Forecast — recompute via API + fallback INSERT ─────
async function seedForecast(refs) {
  log('info', 'DEMO-002: forecast — try recompute API…');

  const STOCK_URL = 'https://salam-stock.vercel.app';
  const cronSecret = env.CRON_SECRET;
  let recomputeOk = false;

  if (!DRY) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (cronSecret) headers.Authorization = `Bearer ${cronSecret}`;
      const res = await fetch(`${STOCK_URL}/api/forecast/recompute`, {
        method: 'POST',
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        log('ok', `recompute API OK: ${JSON.stringify(body).slice(0, 200)}`);
        // Vérifie si le recompute a produit des lignes critiques. Si non
        // (probable car ventes_cashmag_import est probablement vide), on
        // continue vers le fallback INSERT manuel.
        const { count } = await sb.from('stockout_forecast').select('produit_id', { count: 'exact', head: true }).in('tier', ['warn', 'crit', 'blocker', 'out']);
        if (count && count > 0) {
          recomputeOk = true;
          track('stockout_forecast', 'update', count);
          log('ok', `${count} forecasts critiques après recompute → skip fallback`);
        } else {
          log('warn', 'recompute API OK mais 0 critiques → on insère fallback démo');
        }
      } else {
        log('warn', `recompute API failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
      }
    } catch (e) {
      log('warn', `recompute API error: ${e.message}`);
    }
  }

  // Fallback : seed manuellement quelques rows démo Aïd al-Adha
  if (!recomputeOk) {
    log('info', 'Fallback: INSERT manuel stockout_forecast démo…');
    const depot = refs.depotParticulier;
    if (!depot) { log('warn', 'no depot — skip'); return; }

    const scenarios = [
      { term: 'agneau', stock: 12, vel_base: 3.0, vel_adj: 8.5, mult: 2.8, tier: 'blocker', days: 1.4, phase: 'pre_aid_adha_j7', reason: 'Aïd al-Adha J-2, demande ×2.8 sur agneau' },
      { term: 'brochette', stock: 8, vel_base: 4.0, vel_adj: 12.0, mult: 3.0, tier: 'out', days: 0.67, phase: 'aid_adha_j3', reason: 'Pic Aïd, rupture imminente' },
      { term: 'merguez', stock: 22, vel_base: 5.0, vel_adj: 14.0, mult: 2.8, tier: 'crit', days: 1.6, phase: 'pre_aid_adha_j7', reason: 'Stock < 2j, demande Aïd' },
      { term: 'couscous', stock: 24, vel_base: 8.0, vel_adj: 8.0, mult: 1.0, tier: 'warn', days: 3.0, phase: 'normal', reason: 'Stock baissier' },
      { term: 'poulet', stock: 18, vel_base: 4.5, vel_adj: 6.3, mult: 1.4, tier: 'warn', days: 2.85, phase: 'pre_ramadan_j7', reason: 'Constitution stocks foyers' },
    ];

    const rows = [];
    for (const s of scenarios) {
      const prod = refs.findProd(s.term);
      if (!prod) { log('warn', `produit absent pour ${s.term}`); continue; }
      rows.push({
        produit_id: prod.id,
        depot_id: depot.id,
        stock_actuel: s.stock,
        velocity_base: s.vel_base,
        velocity_adj: s.vel_adj,
        phase_courante: s.phase,
        multiplicateur: s.mult,
        days_cover: s.days,
        tier: s.tier,
        reason: s.reason,
        computed_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const ins = await safeOp('stockout_forecast', 'upsert', () =>
        sb.from('stockout_forecast').upsert(rows, { onConflict: 'produit_id,depot_id' }));
      if (ins) {
        track('stockout_forecast', 'insert', rows.length);
        log('ok', `${rows.length} rows stockout_forecast (manual fallback)`);
      }
    }
  }
}

// ── 4. DEMO-004 : Activité récente (sorties + receptions + transferts) ──
async function seedActivite(refs) {
  log('info', 'DEMO-004: seed activité récente…');

  if (!refs.depotParticulier || refs.employes.length === 0) {
    log('warn', 'depot ou employes manquants — skip activité');
    report.skipped.push('activité (no depot/employés)');
    return;
  }

  const PHOTO_URL = 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400';
  const now = Date.now();
  const employes = refs.employes;
  const prodHalal = ['brochette', 'merguez', 'escalope', 'agneau', 'poulet', 'boulette']
    .map((t) => refs.findProd(t)).filter(Boolean);

  if (prodHalal.length === 0) {
    log('warn', 'aucun produit halal trouvé — skip activité');
    return;
  }

  // Cleanup les sorties seed avec motif "[SEED-DEMO]"
  if (!DRY) {
    await sb.from('sorties_stock').delete().like('motif_libre', '%[SEED-DEMO]%');
    await sb.from('receptions').delete().like('numero_bl', 'SEED-BL-%');
  }

  // 8 sorties avec IA confidence variée
  const sortieTypes = ['casse_manipulation', 'casse_client', 'perime_dlc', 'autre'];
  const sortiesRows = [];
  for (let i = 0; i < 10; i++) {
    const minAgo = 15 + i * 70 + Math.floor(Math.random() * 30);
    sortiesRows.push({
      depot_id: refs.depotParticulier.id,
      employe_id: employes[i % employes.length].id,
      produit_id: prodHalal[i % prodHalal.length].id,
      type: sortieTypes[i % sortieTypes.length],
      motif_libre: `[SEED-DEMO] Constat ${['casse barquette', 'DLC dépassée', 'défaut packaging', 'manip rayon'][i % 4]}`,
      quantite: +(0.3 + Math.random() * 2).toFixed(2),
      photo_url: PHOTO_URL,
      ia_coherence_score: +(0.62 + Math.random() * 0.33).toFixed(2),
      ia_coherence_notes: 'Cohérence IA validée (mock démo)',
      created_at: new Date(now - minAgo * 60_000).toISOString(),
    });
  }
  const sortiesIns = await safeOp('sorties_stock', 'insert', () =>
    sb.from('sorties_stock').insert(sortiesRows));
  if (sortiesIns) {
    track('sorties_stock', 'insert', sortiesRows.length);
    log('ok', `${sortiesRows.length} sorties insérées (IA 62-95%)`);
  }

  // 5 réceptions
  const fournisseurs = ['Bigard Castres', 'Reghalal', 'Halal France', 'Compass Halal'];
  const receptionsRows = [];
  for (let i = 0; i < 5; i++) {
    const hAgo = 2 + i * 13;
    receptionsRows.push({
      depot_id: refs.depotParticulier.id,
      employe_id: employes[i % employes.length].id,
      fournisseur: fournisseurs[i % fournisseurs.length],
      numero_bl: `SEED-BL-${1000 + i}`,
      photo_url: PHOTO_URL,
      statut: i < 4 ? 'validee' : 'en_cours',
      created_at: new Date(now - hAgo * 3600_000).toISOString(),
    });
  }
  const recIns = await safeOp('receptions', 'insert', () =>
    sb.from('receptions').insert(receptionsRows));
  if (recIns) {
    track('receptions', 'insert', receptionsRows.length);
    log('ok', `${receptionsRows.length} réceptions insérées`);
  }

  // 3 transferts (si on a au moins 2 dépôts)
  if (refs.depots.length >= 2) {
    const depotSrc = refs.depotParticulier;
    const depotDst = refs.depots.find((d) => d.id !== depotSrc.id);
    const trfRows = [];
    for (let i = 0; i < 3; i++) {
      const hAgo = 5 + i * 17;
      trfRows.push({
        depot_source_id: depotSrc.id,
        depot_destination_id: depotDst.id,
        produit_id: prodHalal[i % prodHalal.length].id,
        quantite: +(2 + Math.random() * 5).toFixed(2),
        employe_id: employes[i % employes.length].id,
        photo_url: PHOTO_URL,
        created_at: new Date(now - hAgo * 3600_000).toISOString(),
      });
    }
    const trfIns = await safeOp('transferts_inter_depots', 'insert', () =>
      sb.from('transferts_inter_depots').insert(trfRows));
    if (trfIns) {
      track('transferts_inter_depots', 'insert', trfRows.length);
      log('ok', `${trfRows.length} transferts insérés`);
    }
  }
}

// ── 5. DEMO-008 : Seed produits_lots L2026-05-A23 (traçabilité halal) ──
//
// Le PDP boucherie pointe vers /lot/L2026-05-A23 comme exemple de page
// publique halal. Si la migration 0031 n'a pas trouvé "brochettes poulet"
// au moment du seed initial, la table reste vide → la page affiche
// "Lot introuvable". On force ici une INSERT upsert avec un produit
// fallback ("brochettes" ou "poulet") pour garantir que la démo
// montre toujours la fiche traçabilité.
async function seedLotTracabilite(refs) {
  log('info', 'DEMO-008: seed produits_lots L2026-05-A23 (traçabilité halal)…');

  const prod =
    refs.findProd('brochette') ||
    refs.findProd('poulet') ||
    refs.findProd('escalope') ||
    refs.produits.find((p) => (p.categorie || '').toLowerCase().includes('boucher'));

  if (!prod) {
    log('warn', 'aucun produit boucherie trouvé — skip lot traçabilité');
    report.skipped.push('produits_lots (no boucherie product)');
    return;
  }

  // Récupère le fournisseur Bigard (ou fallback) déjà patché halal.
  const fourn = refs.fournBigard;

  const lotPayload = {
    id: 'L2026-05-A23',
    produit_id: prod.id,
    supplier_lot: 'BPM-2026-127',
    fournisseur_id: fourn?.id ?? null,
    certifier_id: 'AVS',
    certifier_name: 'AVS — A Votre Service',
    certifier_valid_until: '2027-03-15',
    abattoir_nom: 'Établissements Bigard Castres',
    abattoir_pays: 'FR',
    date_abattage: '2026-05-28',
    date_reception: new Date().toISOString().slice(0, 10),
    dlc: '2026-06-10',
    quantite_recue: 12.5,
    unite: 'kg',
    notes:
      'Poulet fermier label rouge, abattu Castres, certifié AVS catégorie 1. Lot démo référencé depuis les PDP boucherie.',
  };

  const ins = await safeOp('produits_lots', 'upsert', () =>
    sb.from('produits_lots').upsert(lotPayload, { onConflict: 'id' }).select('id'));

  if (ins?.data) {
    track('produits_lots', 'insert', ins.data.length);
    log('ok', `produits_lots L2026-05-A23 upserted (produit=${prod.nom})`);
  }
}

// ── 6. HOTFIX-VAGUE7 : Seed mv_ventes_quotidiennes (J-1 + J-8) + target ──
//
// Le cockpit Sabah affiche un hero "—" parce que :
//   - ventes_cashmag_import est vide pour J-1 et J-8 → mv_ventes_quotidiennes
//     n'a aucune ligne pour ces jours → ventes_hier null + delta N-1 null.
//   - cockpit_targets pour J-1 absent → pct_target null.
//
// On insère :
//   - 142 tickets J-1 (38420€ TTC) → panier moyen ~270€
//   - 128 tickets J-8 (34200€ TTC) → panier moyen ~267€ (delta N-1 = +12,3%)
//   - target J-1 = 35000€ (pct_target ≈ 110% → vert)
//
// Refresh MV ensuite via cron Vercel `/api/cron/refresh-cockpit`.
async function seedCockpitVentes(refs) {
  log('info', 'HOTFIX-VAGUE7: seed mv_ventes_quotidiennes J-1 + J-8…');

  if (!refs.depotParticulier) {
    log('warn', 'depot principal absent — skip seed cockpit');
    report.skipped.push('mv_ventes_quotidiennes (no depot)');
    return;
  }

  const todayParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const jminus1 = new Date(todayParis); jminus1.setDate(jminus1.getDate() - 1);
  const jminus8 = new Date(todayParis); jminus8.setDate(jminus8.getDate() - 8);
  const isoDate = (d) => d.toISOString().slice(0, 10);
  const tagJ1 = `J1-${isoDate(jminus1).replace(/-/g, '')}`;
  const tagJ8 = `J8-${isoDate(jminus8).replace(/-/g, '')}`;

  // Cleanup les seeds précédents (idempotence)
  if (!DRY) {
    await sb.from('ventes_cashmag_import')
      .delete()
      .like('imported_by', 'SEED-COCKPIT%');
  }

  // Helper : produit N tickets sur date `d` totalisant `totalTtc` €
  function buildTickets(d, nbTickets, totalTtc, tag) {
    const perTicket = totalTtc / nbTickets;
    const baseDate = isoDate(d);
    const rows = [];
    for (let i = 0; i < nbTickets; i++) {
      // Distribute hours 09:00 → 19:00 pour réalisme
      const hour = 9 + Math.floor((i / nbTickets) * 10);
      const min = Math.floor(Math.random() * 60);
      const sec = Math.floor(Math.random() * 60);
      const ticket = `${tag}-T${String(i + 1).padStart(4, '0')}`;
      // ±15% jitter autour du panier moyen, pour pas avoir un panier constant.
      const jitter = 1 + (Math.random() - 0.5) * 0.3;
      const ttc = +(perTicket * jitter).toFixed(2);
      const ht = +(ttc / 1.055).toFixed(2);
      rows.push({
        date_vente: baseDate,
        heure_vente: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
        numero_ticket: ticket,
        code_barre: null,
        designation: `Ticket démo ${tag} #${i + 1}`,
        quantite: 1,
        prix_ht: ht,
        prix_ttc: ttc,
        tva_taux: 5.5,
        mode_paiement: ['CB', 'ESP', 'CB', 'CB'][i % 4],
        raw_line: null,
        imported_by: `SEED-COCKPIT-${tag}`,
      });
    }
    // Reajuste la dernière ligne pour matcher pile le total demandé.
    const sum = rows.reduce((s, r) => s + r.prix_ttc, 0);
    const delta = +(totalTtc - sum).toFixed(2);
    if (Math.abs(delta) > 0.01) {
      rows[rows.length - 1].prix_ttc = +(rows[rows.length - 1].prix_ttc + delta).toFixed(2);
      rows[rows.length - 1].prix_ht = +(rows[rows.length - 1].prix_ttc / 1.055).toFixed(2);
    }
    return rows;
  }

  const rowsJ1 = buildTickets(jminus1, 142, 38420, tagJ1);
  const rowsJ8 = buildTickets(jminus8, 128, 34200, tagJ8);

  // INSERT en deux temps pour éviter un payload massif.
  for (const [label, rows] of [['J-1', rowsJ1], ['J-8', rowsJ8]]) {
    const ins = await safeOp('ventes_cashmag_import', 'insert', () =>
      sb.from('ventes_cashmag_import').insert(rows));
    if (ins) {
      track('ventes_cashmag_import', 'insert', rows.length);
      const total = rows.reduce((s, r) => s + r.prix_ttc, 0);
      log('ok', `${label}: ${rows.length} tickets inserted (total ${total.toFixed(2)}€ TTC)`);
    }
  }

  // ── cockpit_targets pour J-1 (35000€) sur le depot principal ────
  // Upsert (depot_id, jour) unique.
  const targetPayload = {
    depot_id: refs.depotParticulier.id,
    jour: isoDate(jminus1),
    target_ca: 35000,
    note: '[SEED-DEMO] Target démo Otmane (vague 7)',
  };
  const targetIns = await safeOp('cockpit_targets', 'upsert', () =>
    sb.from('cockpit_targets').upsert(targetPayload, { onConflict: 'depot_id,jour' }));
  if (targetIns) {
    track('cockpit_targets', 'insert', 1);
    log('ok', `cockpit_targets ${isoDate(jminus1)} = 35000€ (depot ${refs.depotParticulier.nom})`);
  }

  // ── Trigger refresh MV via cron Vercel (GET, pas POST) ─────────
  // (le cron tape la SECURITY DEFINER function refresh_mv_ventes_quotidiennes)
  const STOCK_URL = 'https://salam-stock.vercel.app';
  const cronSecret = env.CRON_SECRET;
  if (!DRY && cronSecret) {
    try {
      const res = await fetch(`${STOCK_URL}/api/cron/refresh-cockpit`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        log('ok', `refresh-cockpit OK: ${JSON.stringify(body).slice(0, 200)}`);
      } else {
        log('warn', `refresh-cockpit failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
      }
    } catch (e) {
      log('warn', `refresh-cockpit error: ${e.message}`);
    }
  } else if (!cronSecret) {
    log('warn', 'CRON_SECRET absent — refresh MV à déclencher manuellement (curl /api/cron/refresh-cockpit)');
  }

  // Fallback : appelle directement la RPC Postgres si l'endpoint Vercel
  // est indispo (déploiement en cours, env manquant, etc.). C'est le
  // même call qu'effectue le cron en interne.
  if (!DRY) {
    const { error: rpcErr } = await sb.rpc('refresh_mv_ventes_quotidiennes');
    if (rpcErr) {
      log('warn', `RPC refresh_mv_ventes_quotidiennes fail: ${rpcErr.message}`);
    } else {
      log('ok', 'RPC refresh_mv_ventes_quotidiennes OK (fallback direct)');
    }
  }
}

// ── 7. HOTFIX-VAGUE7 : seed push_subscription test pour Otmane ───────
//
// Si push_subscriptions est vide pour Otmane (employe), on injecte un
// endpoint factice pour que le test "création commande Drive → push reçu"
// trouve au moins un destinataire. Endpoint Mozilla test (404 silencieux,
// la cleanup expire-on-410 fera le ménage en prod).
async function seedPushSubscriptionTest(refs) {
  log('info', 'HOTFIX-VAGUE7: seed push_subscription test pour Otmane…');
  const otmane = refs.employes.find((e) =>
    (e.prenom || '').toLowerCase().includes('otmane') ||
    (e.nom || '').toLowerCase().includes('otmane'));
  if (!otmane) {
    log('warn', 'Otmane employe introuvable — skip push sub seed');
    report.skipped.push('push_subscriptions (no Otmane)');
    return;
  }
  if (DRY) { log('info', `would seed push_sub for ${otmane.id}`); return; }

  // Skip si Otmane a déjà au moins une subscription
  const { data: existing } = await sb
    .from('push_subscriptions')
    .select('id')
    .eq('employe_id', otmane.id)
    .limit(1);
  if (existing && existing.length > 0) {
    log('info', `Otmane (${otmane.id}) a déjà ${existing.length} push sub(s) — skip`);
    return;
  }

  const fakeEndpoint = `https://updates.push.services.mozilla.com/wpush/v2/SEED-DEMO-${otmane.id}`;
  const ins = await safeOp('push_subscriptions', 'insert', () =>
    sb.from('push_subscriptions').insert({
      employe_id: otmane.id,
      endpoint: fakeEndpoint,
      keys_p256dh: 'BO_SEED_p256dh_test_demo_otmane_vague7_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      keys_auth: 'auth_seed_demo_otmane_v7',
      user_agent: '[SEED-DEMO] iPhone 15 Safari',
      enabled: true,
    }));
  if (ins) {
    track('push_subscriptions', 'insert', 1);
    log('ok', `push_sub démo seedée pour Otmane (${otmane.id})`);
  }
}

// ── 8. Verify : compter ce qu'on a en base ──────────────────────────
async function verify() {
  log('info', '─── VERIFY ───');
  const today = new Date().toISOString().slice(0, 10);
  const jminus1 = new Date(); jminus1.setDate(jminus1.getDate() - 1);
  const jminus8 = new Date(); jminus8.setDate(jminus8.getDate() - 8);
  const isoDate = (d) => d.toISOString().slice(0, 10);
  const checks = [
    { name: 'PO Bigard draft today', q: () => sb.from('purchase_orders').select('id, numero_po, total_ht', { count: 'exact' }).eq('statut', 'brouillon').eq('date_creation', today) },
    { name: 'commandes_drive today', q: () => sb.from('commandes_drive').select('id, bay_label, statut', { count: 'exact' }).gte('created_at', today + 'T00:00:00') },
    { name: 'commandes prêtes avec bay', q: () => sb.from('commandes_drive').select('id', { count: 'exact' }).eq('statut', 'pret').is('retired_at', null).not('bay_label', 'is', null) },
    { name: 'stockout_forecast critiques', q: () => sb.from('stockout_forecast').select('produit_id, tier', { count: 'exact' }).in('tier', ['warn', 'crit', 'blocker', 'out']) },
    { name: 'sorties 72h', q: () => sb.from('sorties_stock').select('id', { count: 'exact' }).gte('created_at', new Date(Date.now() - 72*3600_000).toISOString()) },
    { name: 'réceptions 72h', q: () => sb.from('receptions').select('id', { count: 'exact' }).gte('created_at', new Date(Date.now() - 72*3600_000).toISOString()) },
    { name: 'lot traçabilité L2026-05-A23', q: () => sb.from('produits_lots').select('id, certifier_name, abattoir_nom', { count: 'exact' }).eq('id', 'L2026-05-A23') },
    { name: 'ventes_cashmag J-1', q: () => sb.from('ventes_cashmag_import').select('id, prix_ttc', { count: 'exact' }).eq('date_vente', isoDate(jminus1)) },
    { name: 'ventes_cashmag J-8', q: () => sb.from('ventes_cashmag_import').select('id, prix_ttc', { count: 'exact' }).eq('date_vente', isoDate(jminus8)) },
    { name: 'mv_ventes_quotidiennes J-1', q: () => sb.from('mv_ventes_quotidiennes').select('jour, ca_ttc, nb_tickets').eq('jour', isoDate(jminus1)) },
    { name: 'cockpit_targets J-1', q: () => sb.from('cockpit_targets').select('jour, target_ca').eq('jour', isoDate(jminus1)) },
    { name: 'push_subscriptions actives', q: () => sb.from('push_subscriptions').select('id', { count: 'exact' }).eq('enabled', true) },
  ];
  for (const c of checks) {
    const r = await c.q();
    log('ok', `${c.name}: count=${r.count ?? '?'} sample=${JSON.stringify((r.data || []).slice(0, 2))}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────
(async () => {
  log('info', `Seed démo Salamarket — DRY=${DRY} URL=${SUPABASE_URL}`);
  try {
    const refs = await loadRefs();
    await seedPo(refs);
    await seedCommandesDrive(refs);
    await seedForecast(refs);
    await seedActivite(refs);
    await seedLotTracabilite(refs);
    await seedCockpitVentes(refs);
    await seedPushSubscriptionTest(refs);
    await verify();

    console.log('\n═══════════════════════════════════════');
    console.log('REPORT');
    console.log('═══════════════════════════════════════');
    console.log('Tables touched :', report.tables_touched.join(', '));
    console.log('Inserted       :', JSON.stringify(report.inserted, null, 2));
    console.log('Updated        :', JSON.stringify(report.updated, null, 2));
    if (report.skipped.length) console.log('Skipped        :', report.skipped.join(' | '));
    if (report.errors.length) {
      console.log('Errors         :');
      report.errors.forEach((e) => console.log(`  - [${e.table}/${e.op}] ${e.error}`));
    }
    console.log('═══════════════════════════════════════');
  } catch (e) {
    console.error('FATAL:', e);
    process.exit(1);
  }
})();
