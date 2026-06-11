import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@18?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:5173";

// Champs Drive au poids : envoyés par le client (Checkout.tsx) mais
// ignorés en flow legacy. Présents dans le payload depuis la migration
// 0029 ; consommés ici uniquement quand au moins une ligne a un
// unit_type 'weight' ou 'weight_bracket'.
interface CartItem {
  product_id: string;
  quantity: number;
  unit_type?: "unit" | "weight" | "weight_bracket";
  quantite_kg?: number;
  bracket_index?: number;
}

interface Payload {
  items: CartItem[];
  pickup_slot_id: string;
  payment_method: "online" | "in_store";
  notes?: string;
  /**
   * Code promo saisi côté client (Cart → checkoutStore). JAMAIS la source
   * du montant : la remise est RECALCULÉE ici via la RPC SECURITY DEFINER
   * validate_promo_code(p_code, p_total_cents). On ne fait pas confiance au
   * client pour le discount.
   */
  promo_code?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-11-20.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let reservedSlotId: string | null = null;
  let createdOrderId: string | null = null;          // table `orders` (legacy)
  let createdCommandeDriveId: string | null = null;  // table `commandes_drive` (Drive au poids)

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Auth user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // 2. Validate payload
    const body = (await req.json()) as Payload;
    if (!Array.isArray(body.items) || body.items.length === 0)
      return json({ error: "Panier vide" }, 400);
    if (!body.pickup_slot_id) return json({ error: "Créneau manquant" }, 400);
    if (!["online", "in_store"].includes(body.payment_method))
      return json({ error: "Mode de paiement invalide" }, 400);

    // 3. Re-vérifie les prix produits côté serveur (avec colonnes weight).
    const productIds = body.items.map((i) => i.product_id);
    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, price_cents, in_stock, unit_type, price_per_kg, poids_min_kg, poids_max_kg",
      )
      .in("id", productIds);
    if (prodErr) throw prodErr;

    const productMap = new Map(products!.map((p) => [p.id, p]));

    // 3bis. Récupère l'EAN depuis `produits` (la table `products` n'a pas
    //   de colonne ean ; produits.id == products.id, mêmes UUID). L'EAN
    //   alimente orders.items pour que le trigger sync_drive_order_to_stock
    //   matche par EAN si le match UUID échoue (chemin robuste — cf.
    //   migration 20260531000004). Fallback gracieux : si la requête échoue
    //   ou qu'un produit n'a pas d'EAN, on continue sans (le trigger
    //   retombe sur le match UUID puis nom).
    const eanMap = new Map<string, string>();
    const { data: produitsRows } = await supabaseAdmin
      .from("produits")
      .select("id, ean")
      .in("id", productIds);
    if (produitsRows) {
      for (const r of produitsRows as { id: string; ean: string | null }[]) {
        if (r.ean) eanMap.set(r.id, r.ean);
      }
    }
    let subtotal = 0;
    // Détection panier au poids : si AU MOINS une ligne weight/bracket,
    // tout le panier bascule en flow manual capture (cf. ARCHITECTURE
    // doc dans Checkout.tsx). Les lignes 'unit' co-existent avec
    // quantite_estimee=quantity, montant_estime_ttc = qty × prix unitaire.
    const hasWeightLine = body.items.some(
      (i) => i.unit_type === "weight" || i.unit_type === "weight_bracket",
    );
    const trustedItems = body.items.map((item) => {
      const p = productMap.get(item.product_id) as
        | {
            id: string;
            name: string;
            price_cents: number;
            in_stock: boolean;
            unit_type?: string | null;
            price_per_kg?: number | null;
            poids_min_kg?: number | null;
            poids_max_kg?: number | null;
          }
        | undefined;
      if (!p) throw new Error(`Produit introuvable: ${item.product_id}`);
      if (!p.in_stock) throw new Error(`Produit indisponible: ${p.name}`);
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)
        throw new Error("Quantité invalide");

      // Calcul ligne — selon unit_type (source de vérité côté serveur).
      // L'unit_type côté DB l'emporte sur celui du payload (anti-spoof).
      const unitType = (p.unit_type ?? "unit") as
        | "unit"
        | "weight"
        | "weight_bracket";
      let lineCents = 0;
      let quantiteEstimee = item.quantity; // en pièces par défaut
      if (unitType === "weight") {
        const qtyKg = Math.max(0, item.quantite_kg ?? 0);
        if (qtyKg <= 0)
          throw new Error(`Poids manquant pour « ${p.name} »`);
        // price_per_kg null OU 0 → produit mal configuré côté Stock. On
        // lève une erreur CIBLÉE sur la ligne fautive (nom du produit),
        // pas une 500 générique : le client comprend QUEL article retirer
        // de son panier, et l'équipe sait quel produit corriger en DB.
        const pricePerKg = p.price_per_kg ?? 0;
        if (!(pricePerKg > 0))
          throw new Error(
            `Prix au kilo non configuré pour « ${p.name} ». Retirez cet article ou contactez le magasin.`,
          );
        // qtyKg × price_per_kg en EUR → cents (Math.round pour éviter
        // les flottants type 17.999999)
        lineCents = Math.round(pricePerKg * qtyKg * 100 * item.quantity);
        quantiteEstimee = qtyKg * item.quantity; // kg total
      } else if (unitType === "weight_bracket") {
        // Prix forfaitaire = price_cents (le bracket est juste informatif
        // côté client — le prix est fixe).
        lineCents = p.price_cents * item.quantity;
        // Pour la pesée staff : on note la qty 1 (1 unité du bracket).
        quantiteEstimee = item.quantity;
      } else {
        // unit
        lineCents = p.price_cents * item.quantity;
        quantiteEstimee = item.quantity;
      }
      subtotal += lineCents;

      return {
        // produit_id + ean : champs lus par le trigger
        // sync_drive_order_to_stock (match UUID → EAN → nom). On garde
        // product_id pour rétro-compat des consommateurs existants.
        produit_id: p.id,
        product_id: p.id,
        ean: eanMap.get(p.id) ?? null,
        name: p.name,
        unit_price_cents: p.price_cents,
        quantity: item.quantity,
        line_total_cents: lineCents,
        // Champs pour commandes_drive_lignes (flow manual capture)
        unit_type: unitType,
        quantite_estimee: quantiteEstimee,
        price_per_kg: p.price_per_kg ?? null,
      };
    });

    if (subtotal <= 0) return json({ error: "Montant invalide" }, 400);

    // ── REMISE PROMO — recalcul serveur (jamais confiance au client) ──
    // On ré-appelle la RPC validate_promo_code avec le subtotal RÉEL
    // calculé côté serveur. Le client envoie seulement le CODE ; le
    // montant de la remise est ré-établi ici. Échec / code invalide /
    // minimum non atteint → remise = 0 (on ne bloque jamais la commande,
    // on facture simplement le plein tarif). discountCents est borné au
    // subtotal.
    let promoCode: string | null = null;
    let discountCents = 0;
    const rawPromo =
      typeof body.promo_code === "string" ? body.promo_code.trim() : "";
    if (rawPromo) {
      const { data: promoData, error: promoErr } = await supabaseAdmin.rpc(
        "validate_promo_code",
        { p_code: rawPromo.toUpperCase(), p_total_cents: subtotal },
      );
      if (!promoErr && promoData) {
        const rec = (Array.isArray(promoData) ? promoData[0] : promoData) as
          | { valid?: boolean; code?: string; discount_cents?: number }
          | null;
        if (rec && rec.valid === true) {
          const d = Number(rec.discount_cents);
          if (Number.isFinite(d) && d > 0) {
            discountCents = Math.min(Math.round(d), subtotal);
            promoCode =
              typeof rec.code === "string" && rec.code.trim()
                ? rec.code.trim().toUpperCase()
                : rawPromo.toUpperCase();
          }
        }
      }
      // promoErr (RPC absente) ou code invalide → discountCents reste 0.
    }
    // Montant réellement dû après remise (≥ 0). Source de vérité serveur.
    const totalCents = Math.max(0, subtotal - discountCents);

    // Calcul montant_autorise (marge 20 % SEULEMENT sur lignes weight)
    // — source unique de vérité côté serveur. Le frontend
    // (Checkout.tsx) calcule la MÊME chose via computeCartTotalsCents.
    // Le bracket et l'unit passent SANS marge (prix fixe forfaitaire /
    // pré-établi). Si cette logique évolue, mettre à jour les 2
    // endroits + drive-pesee.ts.
    let weightCentsServer = 0;
    let otherCentsServer = 0;
    for (const it of trustedItems) {
      if (it.unit_type === "weight") {
        weightCentsServer += it.line_total_cents;
      } else {
        otherCentsServer += it.line_total_cents;
      }
    }
    // La remise promo réduit aussi le montant pré-autorisé : on la déduit
    // après application de la marge ×1,20 sur le poids (borné à ≥ 0).
    const autoriseCentsServer = Math.max(
      0,
      Math.ceil(weightCentsServer * 1.2) + otherCentsServer - discountCents,
    );
    const autoriseTtcServer = autoriseCentsServer / 100;

    // 4. Vérifie le créneau (existe + ≥1h dans le futur)
    const { data: slot, error: slotErr } = await supabaseAdmin
      .from("pickup_slots")
      .select("id, slot_start, slot_end, capacity, reserved_count")
      .eq("id", body.pickup_slot_id)
      .single();
    if (slotErr || !slot) return json({ error: "Créneau introuvable" }, 400);

    const slotStartMs = new Date(slot.slot_start).getTime();
    if (slotStartMs - Date.now() < 60 * 60 * 1000)
      return json({ error: "Ce créneau n'est plus réservable (délai 1h)" }, 400);

    // 5. RÉSERVATION ATOMIQUE du créneau (optimistic lock)
    const { data: reserved, error: reserveErr } = await supabaseAdmin
      .from("pickup_slots")
      .update({ reserved_count: slot.reserved_count + 1 })
      .eq("id", body.pickup_slot_id)
      .eq("reserved_count", slot.reserved_count)
      .lt("reserved_count", slot.capacity)
      .select("id")
      .maybeSingle();

    if (reserveErr) throw reserveErr;
    if (!reserved) {
      return json({ error: "Créneau complet ou déjà réservé, choisissez-en un autre" }, 409);
    }
    reservedSlotId = body.pickup_slot_id;

    // 6. Récupère phone + full_name depuis profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("phone, full_name")
      .eq("id", user.id)
      .single();

    // ────────────────────────────────────────────────────────────────
    // BRANCHE Drive AU POIDS — flow manual capture
    // ────────────────────────────────────────────────────────────────
    // Si AU MOINS UNE ligne est weight/weight_bracket, on saute le flow
    // legacy (orders + Stripe Checkout hosted) et on écrit directement
    // dans commandes_drive (canonical) + commandes_drive_lignes. Le
    // frontend appellera ensuite POST /api/stripe/create-payment-intent
    // côté salam-stock avec le commande_id retourné.
    //
    // Hypothèse : la colonne products.id équivaut à produits.id (la
    // table `products` côté salamarket-drive est probablement une VUE
    // de `produits` côté salam-stock, cf. commit `779656f feat(view)`).
    // Si l'INSERT échoue avec une FK violation sur produit_id, c'est
    // que cette hypothèse est fausse — il faudra alors faire un mapping
    // explicite name ILIKE.
    if (hasWeightLine) {
      // a. Récupère un depot par défaut (commandes_drive_lignes.depot_id
      //    est NOT NULL). On prend le premier disponible.
      const { data: defaultDepot, error: depotErr } = await supabaseAdmin
        .from("depots")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (depotErr || !defaultDepot) {
        throw new Error("Aucun dépôt configuré (table depots vide)");
      }

      // b. Génère un numéro de commande lisible
      const numeroCommande = `D2026-${Date.now().toString().slice(-8)}-${Math.floor(
        Math.random() * 1000,
      )
        .toString()
        .padStart(3, "0")}`;

      // c. Crée la commande dans commandes_drive (statut métier
      //    'en_preparation' ; statut_paiement reste NULL — sera mis à
      //    'autorise' par /api/stripe/create-payment-intent).
      //    total_ttc = total estimé APRÈS remise promo (montant que le
      //    client paiera, hors ajustement de pesée). La remise a déjà été
      //    déduite de autoriseTtcServer ci-dessus.
      const totalTtc = totalCents / 100;
      const { data: cmd, error: cmdErr } = await supabaseAdmin
        .from("commandes_drive")
        .insert({
          numero_commande: numeroCommande,
          client_nom:
            profile?.full_name?.trim() || user.email?.split("@")[0] || "Client",
          client_telephone: profile?.phone ?? null,
          client_email: user.email ?? null,
          creneau_retrait: slot.slot_start,
          statut: "en_preparation",
          total_ttc: totalTtc,
          // Pré-calculé ici pour que create-payment-intent (salam-stock)
          // lise une valeur unique source-de-vérité, au lieu de
          // recompute (× 1.20 sur tout le panier) ce qui ignorait la
          // règle "marge SEULEMENT sur weight" et causait le bug du
          // 2026-05-16.
          montant_autorise_ttc: autoriseTtcServer,
          mode_paiement: "stripe",
        })
        .select("id")
        .single();
      if (cmdErr || !cmd) {
        throw new Error(
          `commandes_drive insert échoué : ${cmdErr?.message ?? "no row"}`,
        );
      }
      createdCommandeDriveId = cmd.id; // pour le rollback global (cf. catch)

      // d. Crée les lignes commande
      const lignes = trustedItems.map((it) => ({
        commande_id: cmd.id,
        produit_id: it.product_id, // hypothèse : view products → produits
        depot_id: defaultDepot.id,
        quantite: it.quantite_estimee,
        prix_unitaire:
          it.unit_type === "weight"
            ? it.price_per_kg ?? 0
            : it.unit_price_cents / 100,
        // Champs Drive au poids (migration 0029)
        quantite_estimee: it.quantite_estimee,
        montant_estime_ttc: it.line_total_cents / 100,
        statut_preparation: "en_attente",
      }));
      const { error: lignesErr } = await supabaseAdmin
        .from("commandes_drive_lignes")
        .insert(lignes);
      if (lignesErr) {
        // Rollback : supprime la commande créée pour ne pas laisser
        // de coquille vide en DB. Le slot reserved_count restera +1
        // jusqu'à expiration (handled by le catch global).
        await supabaseAdmin.from("commandes_drive").delete().eq("id", cmd.id);
        createdCommandeDriveId = null;
        throw new Error(
          `commandes_drive_lignes insert échoué : ${lignesErr.message}`,
        );
      }

      // e. Retour minimal — le frontend monte <DriveStripePayment>
      //    avec ce commande_id, qui à son tour appellera l'API
      //    /api/stripe/create-payment-intent.
      return json({
        commande_id: cmd.id,
        numero_commande: numeroCommande,
        montant_estime_ttc: totalTtc,
        montant_autorise_ttc: autoriseTtcServer,
      });
    }

    // 7. Crée la commande pending (FLOW LEGACY : 100% unit, Stripe Checkout)
    const { data: order, error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: user.id,
        pickup_slot_id: body.pickup_slot_id,
        status: "pending",
        payment_method: body.payment_method,
        payment_status: "unpaid",
        items: trustedItems,
        subtotal_cents: subtotal,
        // total_cents = montant réellement dû APRÈS remise promo. Avant ce
        // fix, on stockait `subtotal` ici ET aucune remise n'était passée à
        // Stripe : le client était débité du PLEIN TARIF malgré le code promo.
        total_cents: totalCents,
        customer_email: user.email,
        customer_phone: profile?.phone,
        notes: body.notes ?? null,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;
    createdOrderId = order.id;

    // 8a. Paiement magasin → on laisse l'order en "pending"
    if (body.payment_method === "in_store") {
      // L'order reste en "pending" jusqu'à ce que le client arrive
      // sur /commande/confirmee, qui appellera confirm-order.
      // confirm-order fera l'UPDATE atomique et déclenchera le push.
      return json({
        order_id: order.id,
        redirect_url: `${SITE_URL}/commande/confirmee/${order.id}`,
      });
    }

    // 8b. Paiement en ligne → Stripe Checkout
    // FIX 2026-05-31 (pay-no-applepay-googlepay) : on omet
    // payment_method_types pour laisser Stripe Checkout détecter
    // automatiquement les wallets (Apple Pay / Google Pay) selon la
    // configuration Dashboard. Stripe Checkout active automatiquement
    // les wallets quand `payment_method_types` n'est pas spécifié et que
    // la "automatic payment methods" rule est activée côté Dashboard.
    // Requis également côté Dashboard : Settings → Payment methods →
    // toggle Wallets + Apple Pay domain `salamarket-drive.vercel.app`.
    //
    // REMISE PROMO : les line_items facturent le plein tarif (unit_amount).
    // Pour débiter le montant remisé, on attache un coupon Stripe amount_off
    // (en cents EUR) recalculé côté serveur. On garde au moins 1 centime à
    // régler (Stripe Checkout en mode "payment" refuse un total de 0). Si le
    // discount couvre tout le panier, on le plafonne à subtotal - 1.
    const stripeDiscountCents =
      discountCents > 0 ? Math.min(discountCents, subtotal - 1) : 0;
    let couponId: string | undefined;
    if (stripeDiscountCents > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: stripeDiscountCents,
        currency: "eur",
        duration: "once",
        name: promoCode ? `Remise ${promoCode}` : "Remise",
        metadata: { order_id: order.id, promo_code: promoCode ?? "" },
      });
      couponId = coupon.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: trustedItems.map((it) => ({
        price_data: {
          currency: "eur",
          product_data: { name: it.name },
          unit_amount: it.unit_price_cents,
        },
        quantity: it.quantity,
      })),
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      success_url: `${SITE_URL}/commande/confirmee/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/paiement?cancelled=1&order_id=${order.id}`,
      metadata: {
        order_id: order.id,
        user_id: user.id,
        promo_code: promoCode ?? "",
        discount_cents: String(discountCents),
      },
      locale: "fr",
    });

    const { error: sessionUpdErr } = await supabaseAdmin
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);
    if (sessionUpdErr) throw sessionUpdErr;

    return json({
      order_id: order.id,
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (err) {
    console.error("[create-checkout-session]", err);

    // Rollback (deux flows : orders legacy + commandes_drive nouveau)
    if (createdOrderId) {
      await supabaseAdmin.from("orders").delete().eq("id", createdOrderId);
    }
    if (createdCommandeDriveId) {
      // Lignes drop via on delete cascade.
      await supabaseAdmin
        .from("commandes_drive")
        .delete()
        .eq("id", createdCommandeDriveId);
    }
    if (reservedSlotId) {
      const { data: cur } = await supabaseAdmin
        .from("pickup_slots")
        .select("reserved_count")
        .eq("id", reservedSlotId)
        .single();
      if (cur && cur.reserved_count > 0) {
        await supabaseAdmin
          .from("pickup_slots")
          .update({ reserved_count: cur.reserved_count - 1 })
          .eq("id", reservedSlotId);
      }
    }

    return json({ error: (err as Error).message ?? "Erreur serveur" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
