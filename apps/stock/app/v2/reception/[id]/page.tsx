"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { BarcodeScanner } from "@/components/reception/BarcodeScanner";
import { PhotoCapture } from "@/components/reception/PhotoCapture";
import { ReceptionHeader } from "@/components/v2/reception/ReceptionHeader";
import { LigneList } from "@/components/v2/reception/LigneList";
import { ValidationFooter } from "@/components/v2/reception/ValidationFooter";
import { CartonLearnModal } from "@/components/v2/reception/CartonLearnModal";
import { SurplusModal } from "@/components/v2/reception/SurplusModal";
import { CreateProductModal } from "@/components/v2/reception/CreateProductModal";
import type {
  BdlDetail,
  BdlLigne,
  CartonSearchHit,
  LearnCartonState,
  SurplusState,
} from "@/components/v2/reception/types";
import { useV2 } from "@/lib/v2-store";
import { supabase } from "@/lib/supabase";
import { calculerPmp } from "@/lib/reception/pmp";

/**
 * Page réception d'un BDL — orchestrateur.
 *
 * ARCH-06 : ce fichier était un god component (~1575 lignes). La couche de
 * présentation a été extraite vers components/v2/reception/* (header, liste,
 * footer validation, 3 sheets). Tout l'état et la logique métier (scan, écarts,
 * apprentissage carton, surplus, création produit, finalize, photos, push
 * admin) restent ICI et descendent en props vers des sous-composants purs.
 * Aucun changement de comportement.
 */
export default function BdlReceptionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bdlId = params?.id;
  const employe = useV2((s) => s.currentEmploye);

  const [bdl, setBdl] = useState<BdlDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoSlot, setPhotoSlot] = useState<1 | 2 | 3 | null>(null);
  const [editingNumFourn, setEditingNumFourn] = useState(false);
  const [numFournDraft, setNumFournDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Carton learning state — flow pour apprendre la liaison carton↔produit
  const [learnCartonModal, setLearnCartonModal] =
    useState<LearnCartonState | null>(null);
  const [cartonScannerOpen, setCartonScannerOpen] = useState(false);
  const [cartonSearchQuery, setCartonSearchQuery] = useState("");
  const [cartonSearchResults, setCartonSearchResults] = useState<
    CartonSearchHit[]
  >([]);

  // Surplus modal state — EAN connu du catalogue mais hors BDL
  const [surplusModal, setSurplusModal] = useState<SurplusState | null>(null);
  const [surplusQty, setSurplusQty] = useState<number | "">(1);
  const [adminIds, setAdminIds] = useState<string[]>([]);

  // Create-product modal state — EAN totalement inconnu (pas en catalogue)
  const [createModal, setCreateModal] = useState<{ code: string } | null>(null);
  const [newProdNom, setNewProdNom] = useState("");
  const [newProdCategorie, setNewProdCategorie] = useState("Épicerie");
  const [newProdPrix, setNewProdPrix] = useState("");
  const [newProdQty, setNewProdQty] = useState<number | "">(1);
  const [creatingProd, setCreatingProd] = useState(false);

  // Ref pour éviter stale closure dans le scanner
  const bdlRef = useRef<BdlDetail | null>(null);
  bdlRef.current = bdl;

  // ─── Load BDL details ──────────────────────────────────────────
  async function fetchBdl() {
    if (!bdlId) return;
    setLoading(true);
    const sb = supabase();
    if (!sb) {
      toast.error("Supabase indisponible");
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("bons_de_livraison")
      .select(
        `id, numero_bdl, numero_bdl_fournisseur, fournisseur_id, depot_destination_id, date_livraison_prevue, statut, photo_palette_url_1, photo_palette_url_2, photo_bdl_url, notes,
         fournisseurs (id, nom),
         depots (id, nom),
         bons_de_livraison_lignes (
           id, produit_id, code_barre_attendu, quantite_attendue, quantite_recue, prix_achat_ht, statut,
           produits (id, nom, ean, categorie)
         )`,
      )
      .eq("id", bdlId)
      .single();
    if (error) {
      console.error(error);
      toast.error("BDL introuvable");
      setLoading(false);
      return;
    }
    setBdl(data as unknown as BdlDetail);
    // Marque comme en_cours si encore "prevue"
    if ((data as unknown as BdlDetail).statut === "prevue") {
      await sb
        .from("bons_de_livraison")
        .update({ statut: "en_cours" })
        .eq("id", bdlId);
    }
    setLoading(false);
  }

  useEffect(() => {
    void fetchBdl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bdlId]);

  // Récupère les IDs admins (Otmane + Ahmed) pour push surplus.
  useEffect(() => {
    void (async () => {
      const sb = supabase();
      if (!sb) return;
      // SECURITY : vue publique anon-safe.
      const { data } = await sb
        .from("employes_public")
        .select("id, role, prenom")
        .eq("is_active", true);
      const ids = (
        (data ?? []) as Array<{
          id: string;
          role: string;
          prenom: string | null;
        }>
      )
        .filter(
          (e) =>
            e.role === "admin" || ["Otmane", "Ahmed"].includes(e.prenom ?? ""),
        )
        .map((e) => e.id);
      setAdminIds(ids);
    })().catch((e) => console.warn("[adminIds] fail:", e));
  }, []);

  // Search produits dans modal carton learn step "pick"
  useEffect(() => {
    if (!learnCartonModal || learnCartonModal.step !== "pick") {
      setCartonSearchResults([]);
      return;
    }
    if (!cartonSearchQuery.trim()) {
      setCartonSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const sb = supabase();
      if (!sb) return;
      const q = cartonSearchQuery.trim();
      const { data } = await sb
        .from("produits")
        .select("id, nom, ean, categorie")
        .or(`nom.ilike.%${q}%,marque.ilike.%${q}%,ean.ilike.%${q}%`)
        .limit(15);
      setCartonSearchResults((data ?? []) as CartonSearchHit[]);
    }, 220);
    return () => clearTimeout(t);
  }, [cartonSearchQuery, learnCartonModal]);

  // ─── KPI dérivés ───────────────────────────────────────────────
  const progression = useMemo(() => {
    if (!bdl) return { scanned: 0, total: 0, pct: 0 };
    const total = bdl.bons_de_livraison_lignes.reduce(
      (s, l) => s + l.quantite_attendue,
      0,
    );
    const scanned = bdl.bons_de_livraison_lignes.reduce(
      (s, l) => s + Math.min(l.quantite_recue, l.quantite_attendue),
      0,
    );
    return { scanned, total, pct: total > 0 ? (scanned / total) * 100 : 0 };
  }, [bdl]);

  const allRecu = useMemo(() => {
    if (!bdl) return false;
    return bdl.bons_de_livraison_lignes.every(
      (l) => l.statut === "recu" || l.statut === "manquant",
    );
  }, [bdl]);

  // ─── Scan handler ──────────────────────────────────────────────
  async function handleScan(code: string) {
    setScannerOpen(false);
    const cur = bdlRef.current;
    if (!cur) return;
    const sb = supabase();
    if (!sb) {
      toast.error("Supabase indisponible");
      return;
    }

    // 0. CARTON CONNU ? Lookup la table codes_barres_cartons.
    //    Si trouvé → on récupère le produit lié + multiplier, puis on
    //    re-route comme si on avait scanné l'EAN unitaire N fois.
    const { data: cartonRow, error: cartonErr } = await sb
      .from("codes_barres_cartons")
      .select("ean_carton, produit_id, quantite_par_carton")
      .eq("ean_carton", code)
      .maybeSingle();
    // Une erreur DB ici (≠ not-found) ré-routerait à tort le scan vers le
    // chemin "EAN unitaire" : on la trace pour le diagnostic.
    if (cartonErr)
      console.error("[reception] lookup carton échoué:", cartonErr);
    const carton = cartonRow as {
      ean_carton: string;
      produit_id: string;
      quantite_par_carton: number;
    } | null;
    if (carton) {
      // Trouve la ligne BDL qui matche ce produit
      const matched = cur.bons_de_livraison_lignes.find(
        (l) => l.produit_id === carton.produit_id,
      );
      if (matched) {
        const newQte = matched.quantite_recue + carton.quantite_par_carton;
        const newStat: BdlLigne["statut"] =
          newQte >= matched.quantite_attendue ? "recu" : "attendu";
        const { error } = await sb
          .from("bons_de_livraison_lignes")
          .update({
            quantite_recue: newQte,
            statut: newStat,
            scanne_le: new Date().toISOString(),
            scanne_par: employe?.id ?? null,
          })
          .eq("id", matched.id);
        if (error) {
          // Sans ce check, un échec DB affichait un faux succès et un reload
          // révélait la perte (la quantité du carton n'était pas persistée).
          toast.error(error.message);
          return;
        }
        toast.success(
          `Carton ${matched.produits?.nom ?? "produit"} · +${carton.quantite_par_carton} (${newQte}/${matched.quantite_attendue})`,
          { duration: 1800 },
        );
        void fetchBdl();
        return;
      }
      // Produit du carton hors BDL → modal surplus avec la qty du carton
      const { data: prodNom } = await sb
        .from("produits")
        .select("id, nom")
        .eq("id", carton.produit_id)
        .maybeSingle();
      const pn = prodNom as { id: string; nom: string } | null;
      if (pn) {
        setSurplusModal({
          code,
          produitNom: pn.nom,
          produitId: pn.id,
        });
        setSurplusQty(carton.quantite_par_carton);
        return;
      }
    }

    // Match contre une ligne du BDL ?
    const matched = cur.bons_de_livraison_lignes.find(
      (l) => l.code_barre_attendu === code || l.produits?.ean === code,
    );

    if (matched) {
      const nouvelleQte = matched.quantite_recue + 1;
      const nouveauStatut: BdlLigne["statut"] =
        nouvelleQte >= matched.quantite_attendue ? "recu" : "attendu";
      const { error } = await sb
        .from("bons_de_livraison_lignes")
        .update({
          quantite_recue: nouvelleQte,
          statut: nouveauStatut,
          scanne_le: new Date().toISOString(),
          scanne_par: employe?.id ?? null,
        })
        .eq("id", matched.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(
        `${matched.produits?.nom ?? "Produit"} · +1 (${nouvelleQte}/${matched.quantite_attendue})`,
        { duration: 1600 },
      );
      void fetchBdl();
      return;
    }

    // EAN ∉ BDL : lookup produit en catalogue
    const { data: prod } = await sb
      .from("produits")
      .select("id, nom, ean")
      .eq("ean", code)
      .maybeSingle();
    const prodRow = prod as { id?: string; nom?: string } | null;

    if (prodRow?.id) {
      // Produit connu mais hors BDL → modal surplus
      setSurplusModal({
        code,
        produitNom: prodRow.nom ?? "Produit",
        produitId: prodRow.id,
      });
      setSurplusQty(1);
      return;
    }

    // Produit totalement inconnu → modal création
    setCreateModal({ code });
    setNewProdNom("");
    setNewProdCategorie("Épicerie");
    setNewProdPrix("");
    setNewProdQty(1);
  }

  // ─── Create-product submit ─────────────────────────────────────
  async function submitCreateProduct() {
    if (!createModal || !bdl) return;
    const nom = newProdNom.trim();
    if (nom.length < 2) {
      toast.error("Nom du produit requis (≥ 2 caractères)");
      return;
    }
    const prix = parseFloat(newProdPrix.replace(",", "."));
    if (Number.isNaN(prix) || prix <= 0) {
      toast.error("Prix unitaire invalide");
      return;
    }
    const qty = Math.max(1, Math.floor(Number(newProdQty) || 0));
    setCreatingProd(true);
    const sb = supabase();
    if (!sb) {
      setCreatingProd(false);
      return;
    }
    try {
      // 1. Insère le produit
      const { data: created, error: errProd } = await sb
        .from("produits")
        .insert({
          ean: createModal.code,
          nom,
          categorie: newProdCategorie,
          requires_barcode_print: false,
        })
        .select("id")
        .single();
      if (errProd) throw new Error(errProd.message);
      const produitId = (created as { id: string }).id;

      // 2. Prix initial dans stock_par_depot pour le dépôt destination.
      //    Erreur vérifiée : sinon le prix saisi serait perdu en silence
      //    (produit invisible/non vendable dans /v2/stock).
      if (bdl.depot_destination_id) {
        const { error: errStock } = await sb.from("stock_par_depot").insert({
          produit_id: produitId,
          depot_id: bdl.depot_destination_id,
          quantite: 0,
          prix_vente: prix,
          is_visible: true,
        });
        if (errStock)
          throw new Error(`Stock initial non créé : ${errStock.message}`);
      } else {
        throw new Error(
          "Dépôt destination manquant sur le BDL : impossible d'enregistrer le prix.",
        );
      }

      // 3. Ajoute une ligne BDL avec qty_attendue = qty saisie et qty_recue = qty saisie
      //    (statut "recu" car on a déjà la marchandise sous la main)
      const { error: errLigne } = await sb
        .from("bons_de_livraison_lignes")
        .insert({
          bdl_id: bdl.id,
          produit_id: produitId,
          code_barre_attendu: createModal.code,
          quantite_attendue: qty,
          quantite_recue: qty,
          statut: "recu",
          scanne_le: new Date().toISOString(),
          scanne_par: employe?.id ?? null,
        });
      if (errLigne)
        throw new Error(
          `Ligne de réception non enregistrée : ${errLigne.message}`,
        );

      // Push iPhone admin — l'employé vient de créer une fiche produit
      // pendant une réception, l'admin doit la valider (prix notamment)
      void import("@/lib/notifications").then((m) =>
        m.pushToAdmins({
          title: `🆕 Nouvelle fiche produit créée`,
          body: `${nom} (EAN ${createModal.code}) par ${employe?.prenom ?? "employé"}. Prix ${prix.toFixed(2)}€ à valider.`,
          url: "/v2/stock",
          tag: `prod-${produitId}`,
        }),
      );

      toast.success(
        `Fiche créée : ${nom} · ${qty} unité${qty > 1 ? "s" : ""} reçue${qty > 1 ? "s" : ""} · admin notifié`,
        {
          duration: 2400,
        },
      );
      setCreateModal(null);
      void fetchBdl();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur création");
    } finally {
      setCreatingProd(false);
    }
  }

  // ─── Carton learn : scan produit interne + bind au code carton ──
  async function handleCartonInternalScan(code: string) {
    setCartonScannerOpen(false);
    if (!learnCartonModal) return;
    const sb = supabase();
    if (!sb) return;
    const { data: prod } = await sb
      .from("produits")
      .select("id, nom, ean, categorie")
      .eq("ean", code)
      .maybeSingle();
    const p = prod as {
      id: string;
      nom: string;
      ean: string | null;
      categorie: string | null;
    } | null;
    if (!p) {
      toast.warning(
        `EAN ${code} inconnu — utilise la recherche par nom ci-dessous.`,
        { duration: 3500 },
      );
      return;
    }
    await bindCartonToProduct(p.id, p.nom);
  }

  async function bindCartonToProduct(produitId: string, produitNom: string) {
    if (!learnCartonModal || !bdl) return;
    const sb = supabase();
    if (!sb) return;
    const { error: errLearn } = await sb.from("codes_barres_cartons").insert({
      ean_carton: learnCartonModal.code,
      produit_id: produitId,
      quantite_par_carton: learnCartonModal.qty,
      learned_by: employe?.id ?? null,
    });
    if (errLearn) {
      toast.error("Erreur apprentissage carton : " + errLearn.message);
      return;
    }
    const cur = bdlRef.current;
    const matched = cur?.bons_de_livraison_lignes.find(
      (l) => l.produit_id === produitId,
    );
    // Erreur vérifiée sur les deux branches : sinon la quantité « apprise »
    // est perdue alors qu'on affiche « Carton appris » (faux succès).
    if (matched) {
      const newQte = matched.quantite_recue + learnCartonModal.qty;
      const newStat: BdlLigne["statut"] =
        newQte >= matched.quantite_attendue ? "recu" : "attendu";
      const { error: errMaj } = await sb
        .from("bons_de_livraison_lignes")
        .update({
          quantite_recue: newQte,
          statut: newStat,
          scanne_le: new Date().toISOString(),
          scanne_par: employe?.id ?? null,
        })
        .eq("id", matched.id);
      if (errMaj) {
        toast.error("Quantité non enregistrée : " + errMaj.message);
        return;
      }
    } else {
      const { error: errIns } = await sb
        .from("bons_de_livraison_lignes")
        .insert({
          bdl_id: bdl.id,
          produit_id: produitId,
          code_barre_attendu: learnCartonModal.code,
          quantite_attendue: learnCartonModal.qty,
          quantite_recue: learnCartonModal.qty,
          statut: "recu",
          scanne_le: new Date().toISOString(),
          scanne_par: employe?.id ?? null,
        });
      if (errIns) {
        toast.error("Ligne non enregistrée : " + errIns.message);
        return;
      }
    }
    toast.success(
      `Carton appris : ${produitNom} × ${learnCartonModal.qty} (codes liés)`,
      { duration: 3000 },
    );
    setLearnCartonModal(null);
    setCartonSearchQuery("");
    setCartonSearchResults([]);
    void fetchBdl();
  }

  // ─── Surplus submit ────────────────────────────────────────────
  async function submitSurplus() {
    if (!surplusModal || !bdl) return;
    const sb = supabase();
    if (!sb) return;
    const { error } = await sb.from("alertes_surplus").insert({
      bdl_id: bdl.id,
      code_barre_scanne: surplusModal.code,
      produit_id: surplusModal.produitId,
      quantite_surplus: Number(surplusQty) || 1,
      signale_par: employe?.id ?? null,
      statut: "en_attente",
      notes: `Détecté au scan du BDL ${bdl.numero_bdl} — produit non commandé.`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    // Notif interne legacy
    // HOTFIX vague 7 : server action injecte x-internal-secret.
    void import("@/lib/actions/notify")
      .then((m) =>
        m.sendInternalNotify({
          kind: "surplus_reception",
          payload: {
            bdl: bdl.numero_bdl,
            produit: surplusModal.produitNom,
            quantite: Number(surplusQty) || 1,
            signale_par:
              `${employe?.prenom ?? ""} ${employe?.nom ?? ""}`.trim(),
          },
        }),
      )
      .catch(() => {});
    // Push iPhone Otmane + Ahmed
    void import("@/lib/notifications").then((m) =>
      m.pushToAdmins({
        title: `📦 Surplus ${bdl.fournisseurs?.nom ?? "fournisseur"}`,
        body: `${surplusModal.produitNom} × ${surplusQty} non commandé sur ${bdl.numero_bdl}`,
        url: "/v2/admin/alertes-surplus",
        tag: `surplus-${bdl.id}-${surplusModal.code}`,
      }),
    );
    toast.success("Surplus signalé (push iPhone admin envoyée)", {
      duration: 2400,
    });
    setSurplusModal(null);
  }

  // ─── Photo upload (palette x2 + BDL papier) ───────────────────
  async function handlePhotoCapture(dataUrl: string) {
    if (!bdl || photoSlot === null) return;
    const sb = supabase();
    if (!sb) return;
    const field =
      photoSlot === 1
        ? "photo_palette_url_1"
        : photoSlot === 2
          ? "photo_palette_url_2"
          : "photo_bdl_url";
    const { error } = await sb
      .from("bons_de_livraison")
      .update({ [field]: dataUrl })
      .eq("id", bdl.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      photoSlot === 3
        ? "Photo du BDL papier enregistrée"
        : `Photo palette ${photoSlot} enregistrée`,
    );
    setPhotoOpen(false);
    setPhotoSlot(null);
    void fetchBdl();
  }

  // ─── N° BDL fournisseur (édition inline) ──────────────────────
  async function saveNumeroFournisseur() {
    if (!bdl) return;
    const sb = supabase();
    if (!sb) return;
    const trimmed = numFournDraft.trim();
    const { error } = await sb
      .from("bons_de_livraison")
      .update({ numero_bdl_fournisseur: trimmed || null })
      .eq("id", bdl.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("N° BDL fournisseur enregistré");
    setEditingNumFourn(false);
    void fetchBdl();
  }

  // ─── Validation finale BDL ─────────────────────────────────────
  async function finalize() {
    if (!bdl) return;
    // Photos palette OBLIGATOIRES — preuve livraison + protection litige
    if (!bdl.photo_palette_url_1 || !bdl.photo_palette_url_2) {
      const missing =
        !bdl.photo_palette_url_1 && !bdl.photo_palette_url_2
          ? "Les 2 photos palette"
          : !bdl.photo_palette_url_1
            ? "La photo palette n°1"
            : "La photo palette n°2";
      toast.error(
        `${missing} obligatoire${missing.startsWith("Les") ? "s" : ""} avant validation. Voir section "Photos palette" en haut.`,
        { duration: 6000 },
      );
      return;
    }
    if (!allRecu) {
      const ok = window.confirm(
        "Certaines lignes ne sont ni reçues ni marquées manquantes. Valider quand même ?",
      );
      if (!ok) return;
    }
    setSubmitting(true);
    const sb = supabase();
    if (!sb) {
      setSubmitting(false);
      return;
    }
    try {
      // Garde : sans dépôt destination, on ne peut pas créditer le stock.
      // (Évite un insert depot_id=null avalé → marchandise reçue, stock faux.)
      const depotId = bdl.depot_destination_id;
      if (!depotId) {
        throw new Error(
          "Dépôt destination manquant sur le BDL : réception impossible.",
        );
      }
      // Garde anti double-finalisation : relit le statut en DB (l'état local
      // peut être périmé / double-clic / 2e onglet). Pas de UNIQUE sur
      // stock_movements.reference_id → re-finaliser doublerait le stock.
      const { data: frais, error: errStatut } = await sb
        .from("bons_de_livraison")
        .select("statut")
        .eq("id", bdl.id)
        .single();
      if (errStatut)
        throw new Error(`Lecture du BDL impossible : ${errStatut.message}`);
      if ((frais as { statut: string }).statut === "receptionnee") {
        throw new Error("BDL déjà réceptionné : validation refusée.");
      }
      // 1. Pour chaque ligne reçue, créditer le stock via la RPC atomique
      //    adjust_stock (verrou ligne + ledger stock_movements) — même chemin
      //    que la réception scan-first (DÉCISION 2). Chaque écriture est
      //    vérifiée : une erreur stoppe AVANT de marquer le BDL réceptionné
      //    (sinon stock faux + BDL « terminé »).
      for (const l of bdl.bons_de_livraison_lignes) {
        if (l.statut !== "recu" || !l.produit_id || l.quantite_recue <= 0) {
          continue;
        }
        // Lit l'état AVANT incrément pour le coût moyen pondéré (PMP).
        const { data: avant, error: errSel } = await sb
          .from("stock_par_depot")
          .select("quantite, cout_achat_ht")
          .eq("produit_id", l.produit_id)
          .eq("depot_id", depotId)
          .maybeSingle();
        if (errSel)
          throw new Error(`Lecture du stock impossible : ${errSel.message}`);
        const qteAvant = Number(
          (avant as { quantite: number } | null)?.quantite ?? 0,
        );
        const coutAvant =
          (avant as { cout_achat_ht: number | null } | null)?.cout_achat_ht ??
          null;

        const { error: errAdj } = await sb.rpc("adjust_stock", {
          p_produit_id: l.produit_id,
          p_depot_id: depotId,
          p_delta: l.quantite_recue,
          p_type: "reception",
          p_lot_id: null,
          p_reference_id: bdl.id,
          p_actor_id: employe?.id ?? null,
        });
        if (errAdj) throw new Error(`Stock non mis à jour : ${errAdj.message}`);

        // SYNCHRO COÛT (PMP) — même helper que le flux scan-first.
        // Hors-bloquant : le stock est déjà entré, on ne casse pas la
        // réception pour un coût non mis à jour.
        const nouveauCout = calculerPmp({
          qteAvant,
          coutAvant,
          qteRecue: l.quantite_recue,
          coutRecu:
            l.prix_achat_ht != null && l.prix_achat_ht > 0
              ? l.prix_achat_ht
              : null,
        });
        if (nouveauCout != null) {
          const { error: errCout } = await sb
            .from("stock_par_depot")
            .update({ cout_achat_ht: nouveauCout })
            .eq("produit_id", l.produit_id)
            .eq("depot_id", depotId);
          if (errCout)
            console.error(
              "[finalize] maj cout_achat_ht échouée:",
              errCout.message,
            );
        }
      }
      // 2. Marque BDL receptionnee (seulement si tout le stock est passé)
      const { error: errBdl } = await sb
        .from("bons_de_livraison")
        .update({
          statut: "receptionnee",
          receptionne_par: employe?.id ?? null,
          receptionne_le: new Date().toISOString(),
        })
        .eq("id", bdl.id);
      if (errBdl)
        throw new Error(`Statut du BDL non enregistré : ${errBdl.message}`);
      // 3. Notif legacy
      // HOTFIX vague 7 : server action injecte x-internal-secret.
      void import("@/lib/actions/notify")
        .then((m) =>
          m.sendInternalNotify({
            kind: "bdl_receptionne",
            payload: {
              bdl: bdl.numero_bdl,
              fournisseur: bdl.fournisseurs?.nom,
              depot: bdl.depots?.nom,
              scanned: progression.scanned,
              total: progression.total,
              employe: `${employe?.prenom} ${employe?.nom}`,
            },
          }),
        )
        .catch(() => {});
      // 4. Push iPhone admin — réception complète, stock mis à jour
      void import("@/lib/notifications").then((m) =>
        m.pushToAdmins({
          title: `✅ Réception ${bdl.fournisseurs?.nom ?? "BDL"} validée`,
          body: `${bdl.numero_bdl} · ${bdl.depots?.nom ?? "?"} · ${progression.scanned}/${progression.total} unités · par ${employe?.prenom ?? "employé"}`,
          url: "/v2/reception",
          tag: `bdl-done-${bdl.id}`,
        }),
      );
      toast.success("Réception validée. Admin notifié.");
      router.replace("/v2/reception");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur validation");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <V2Shell hideNav>
        <div className="px-5 pt-10 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-text-secondary">Chargement BDL…</p>
        </div>
      </V2Shell>
    );
  }

  if (!bdl) {
    return (
      <V2Shell hideNav>
        <div className="px-5 pt-10 text-center">
          <p className="text-sm text-text-secondary">BDL introuvable.</p>
          <button
            onClick={() => router.replace("/v2/reception")}
            className="mt-4 btn-primary"
          >
            Retour
          </button>
        </div>
      </V2Shell>
    );
  }

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="sapin" />

      {/* Header — sticky désactivé pour éviter collision avec V2Shell
          sticky top-0 z-30 (le shell header reste fixe en haut, on
          laisse celui-ci scroller naturellement). */}
      <ReceptionHeader
        bdl={bdl}
        progression={progression}
        editingNumFourn={editingNumFourn}
        numFournDraft={numFournDraft}
        onNumFournDraftChange={setNumFournDraft}
        onStartEditNumFourn={() => {
          setNumFournDraft(bdl.numero_bdl_fournisseur ?? "");
          setEditingNumFourn(true);
        }}
        onSaveNumFourn={() => void saveNumeroFournisseur()}
        onCancelEditNumFourn={() => setEditingNumFourn(false)}
      />

      {/* Liste des lignes attendues + zone photos */}
      <LigneList
        bdl={bdl}
        onOpenPhotoSlot={(slot) => {
          setPhotoSlot(slot);
          setPhotoOpen(true);
        }}
      />

      {/* Floating actions — diffèrent selon le statut */}
      <ValidationFooter
        bdl={bdl}
        progression={progression}
        allRecu={allRecu}
        submitting={submitting}
        onScan={() => setScannerOpen(true)}
        onFinalize={() => void finalize()}
      />

      {/* Scanner modal */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => void handleScan(code)}
      />

      {/* Scanner DÉDIÉ apprentissage carton — scan d'un produit interne */}
      <BarcodeScanner
        open={cartonScannerOpen}
        onClose={() => setCartonScannerOpen(false)}
        onScan={(code) => void handleCartonInternalScan(code)}
      />

      {/* Photo capture modal */}
      <PhotoCapture
        open={photoOpen}
        onClose={() => {
          setPhotoOpen(false);
          setPhotoSlot(null);
        }}
        onCapture={(d) => void handlePhotoCapture(d)}
      />

      {/* Carton learn modal — apprentissage liaison carton↔produit */}
      <CartonLearnModal
        state={learnCartonModal}
        cartonScannerOpen={cartonScannerOpen}
        searchQuery={cartonSearchQuery}
        searchResults={cartonSearchResults}
        onClose={() => setLearnCartonModal(null)}
        onChangeState={(next) => setLearnCartonModal(next)}
        onOpenCartonScanner={() => setCartonScannerOpen(true)}
        onSearchQueryChange={setCartonSearchQuery}
        onBindProduct={(id, nom) => void bindCartonToProduct(id, nom)}
      />

      {/* Surplus modal */}
      <SurplusModal
        state={surplusModal}
        qty={surplusQty}
        onClose={() => setSurplusModal(null)}
        onQtyChange={setSurplusQty}
        onSubmit={() => void submitSurplus()}
      />

      {/* Create-product modal — EAN totalement inconnu */}
      <CreateProductModal
        code={createModal?.code ?? null}
        nom={newProdNom}
        categorie={newProdCategorie}
        prix={newProdPrix}
        qty={newProdQty}
        creating={creatingProd}
        onClose={() => setCreateModal(null)}
        onSwitchToCarton={() => {
          if (!createModal) return;
          setLearnCartonModal({
            code: createModal.code,
            step: "qty",
            qty: 0,
          });
          setCreateModal(null);
        }}
        onNomChange={setNewProdNom}
        onCategorieChange={setNewProdCategorie}
        onPrixChange={setNewProdPrix}
        onQtyChange={setNewProdQty}
        onSubmit={() => void submitCreateProduct()}
      />
    </V2Shell>
  );
}
