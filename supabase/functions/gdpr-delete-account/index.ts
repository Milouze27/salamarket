import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * gdpr-delete-account — RGPD art. 17 (droit à l'effacement).
 *
 * Stratégie : ANONYMISATION, pas hard-delete de auth.users.
 * Raison comptable + intégrité référentielle : `orders.user_id` est
 * NOT NULL + FK profiles(id) ON DELETE RESTRICT. On ne peut donc ni
 * supprimer le profil ni orphaniser le user_id sans casser les commandes,
 * qui doivent être conservées (pseudonymisées) 10 ans pour les obligations
 * comptables. On efface donc toutes les PII et on coupe l'accès.
 *
 * Ce qui est fait, avec la clé service_role :
 *  1. profiles        → full_name='Anonyme', phone='', email masqué (colonnes NOT NULL).
 *  2. orders          → customer_email/customer_phone effacés (user_id conservé).
 *  3. commandes_drive → client_nom='Anonyme', client_telephone/client_email = null
 *                       (miroir 1-1 : commandes_drive.id = orders.id) ET les
 *                       commandes au poids (id ≠ orders.id) retrouvées par
 *                       client_email/client_telephone d'origine.
 *  4. comptes_pro     → PII délégué (nom/téléphone/email) effacées si l'user
 *                       est délégué d'un compte Pro.
 *  5. push_subscriptions → suppression de toutes les souscriptions du user.
 *  6. déconnexion globale (révocation des sessions/refresh tokens).
 *
 * Sécurité : un utilisateur ne peut supprimer QUE son propre compte. L'id
 * cible provient EXCLUSIVEMENT du JWT vérifié (auth.getUser), jamais du body.
 */
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  console.log("[gdpr-delete-account] invoked, method:", req.method);

  try {
    // 1. Authentification : on dérive l'identité UNIQUEMENT du JWT.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: userErr,
    } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const userId = user.id;
    console.log(`[gdpr-delete-account] user=${userId}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Masque d'email déterministe mais non réversible vers l'identité réelle.
    const maskedEmail = `deleted+${userId}@deleted.salamarket.local`;

    // 1b. Capturer les PII ORIGINALES avant d'anonymiser le profil : elles
    //     servent à retrouver les commandes au poids (commandes_drive.id ≠
    //     orders.id → le miroir 1-1 ne les couvre pas, seul client_email/
    //     client_telephone les relie au client).
    const { data: profileBefore } = await supabaseAdmin
      .from("profiles")
      .select("email, phone")
      .eq("id", userId)
      .maybeSingle();
    const originalEmails = [user.email, profileBefore?.email].filter(
      (e): e is string => typeof e === "string" && e.length > 0,
    );
    const originalPhones = [profileBefore?.phone].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );

    // 2. Anonymiser le profil (colonnes NOT NULL → on met des valeurs, pas null).
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: "Anonyme",
        phone: "",
        email: maskedEmail,
      })
      .eq("id", userId);
    if (profileErr) {
      console.error("[gdpr-delete-account] profile anon failed:", profileErr);
      return json({ error: "Profile anonymization failed" }, 500);
    }

    // 3. Récupérer les commandes du user pour anonymiser le miroir Stock.
    const { data: orders, error: ordersSelErr } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("user_id", userId);
    if (ordersSelErr) {
      console.error(
        "[gdpr-delete-account] orders select failed:",
        ordersSelErr,
      );
      return json({ error: "Orders lookup failed" }, 500);
    }
    const orderIds = (orders ?? []).map((o) => o.id);

    // 4. Effacer les PII embarquées dans orders (user_id conservé : NOT NULL + FK RESTRICT).
    const { error: ordersUpdErr } = await supabaseAdmin
      .from("orders")
      .update({ customer_email: null, customer_phone: null })
      .eq("user_id", userId);
    if (ordersUpdErr) {
      console.error("[gdpr-delete-account] orders anon failed:", ordersUpdErr);
      return json({ error: "Orders anonymization failed" }, 500);
    }

    // 5. Anonymiser le miroir commandes_drive (id 1-1 avec orders).
    let driveAnonymized = 0;
    if (orderIds.length > 0) {
      const { error: driveErr, count } = await supabaseAdmin
        .from("commandes_drive")
        .update(
          {
            client_nom: "Anonyme",
            client_telephone: null,
            client_email: null,
          },
          { count: "exact" },
        )
        .in("id", orderIds);
      if (driveErr) {
        console.error(
          "[gdpr-delete-account] commandes_drive anon failed:",
          driveErr,
        );
        return json({ error: "Drive orders anonymization failed" }, 500);
      }
      driveAnonymized = count ?? 0;
    }

    // 5b. Commandes au poids : commandes_drive non miroirées dans orders
    //     (id ≠ orders.id). On les retrouve par client_email / client_telephone
    //     d'origine et on efface les PII (client_nom NOT NULL → 'Anonyme').
    let driveByPii = 0;
    const piiAnon = {
      client_nom: "Anonyme",
      client_telephone: null,
      client_email: null,
    };
    for (const email of originalEmails) {
      const { count } = await supabaseAdmin
        .from("commandes_drive")
        .update(piiAnon, { count: "exact" })
        .eq("client_email", email);
      driveByPii += count ?? 0;
    }
    for (const phone of originalPhones) {
      const { count } = await supabaseAdmin
        .from("commandes_drive")
        .update(piiAnon, { count: "exact" })
        .eq("client_telephone", phone);
      driveByPii += count ?? 0;
    }

    // 5c. Comptes Pro : si l'utilisateur est délégué d'un compte Pro, ses PII
    //     (nom/téléphone/email délégué, colonnes NOT NULL) doivent aussi être
    //     effacées au titre du droit à l'effacement.
    const { error: proErr, count: proCount } = await supabaseAdmin
      .from("comptes_pro")
      .update(
        {
          delegue_nom: "Anonyme",
          delegue_telephone: "",
          delegue_email: maskedEmail,
        },
        { count: "exact" },
      )
      .eq("delegue_user_id", userId);
    if (proErr) {
      console.error("[gdpr-delete-account] comptes_pro anon failed:", proErr);
      return json({ error: "Pro accounts anonymization failed" }, 500);
    }

    // 6. Supprimer les souscriptions push de l'utilisateur.
    const { error: pushErr } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId);
    if (pushErr) {
      console.error(
        "[gdpr-delete-account] push_subscriptions delete failed:",
        pushErr,
      );
      return json({ error: "Push cleanup failed" }, 500);
    }

    // 7. Révoquer toutes les sessions (déconnexion globale, accès coupé).
    const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(
      userId,
      "global",
    );
    if (signOutErr) {
      // Non bloquant : l'anonymisation est faite, le client se déconnecte aussi.
      console.error("[gdpr-delete-account] global signOut failed:", signOutErr);
    }

    console.log(
      `[gdpr-delete-account] done user=${userId} orders=${orderIds.length} drive=${driveAnonymized}`,
    );

    return json({
      deleted: true,
      anonymized: {
        profile: true,
        orders: orderIds.length,
        commandes_drive: driveAnonymized,
        commandes_drive_au_poids: driveByPii,
        comptes_pro: proCount ?? 0,
        push_subscriptions: true,
      },
    });
  } catch (err) {
    console.error("[gdpr-delete-account]", err);
    return json({ error: (err as Error).message ?? "Server error" }, 500);
  }
});
