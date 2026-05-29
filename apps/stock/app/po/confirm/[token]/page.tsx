"use client";

/* /po/confirm/[token] — Page publique pour le grossiste
 * ──────────────────────────────────────────────────────
 * Le grossiste reçoit l'email "Salam Stock — Nouvelle commande PO-010234"
 * avec un bouton vert "Confirmer la commande". Tap → cette page →
 * confirme en 1 tap depuis son téléphone, sans login.
 *
 * Le token est un payload signé (cf. /api/po/confirm), pas un secret
 * persisté en base. La page est aussi accessible depuis le poste fixe
 * du grossiste — design propre, sapin/cream, lisible en 1 seconde.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Loader2,
  Package,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";

interface ConfirmResponse {
  ok: boolean;
  error?: string;
  po?: {
    numero_po: string;
    fournisseur_nom: string;
    depot_nom: string;
    depot_adresse: string | null;
    date_livraison_prevue: string | null;
    total_ht: number;
    total_ttc: number;
    lignes: Array<{
      ref: string | null;
      qty: number;
      pu: number;
      total: number;
    }>;
    statut: string;
    already_confirmed: boolean;
  };
}

function eur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function PoPublicConfirmPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [data, setData] = useState<ConfirmResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!token) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/po/confirm?token=${encodeURIComponent(token!)}`);
      const json = (await res.json()) as ConfirmResponse;
      setData(json);
      if (json.po?.already_confirmed) setConfirmed(true);
    } catch (err) {
      setData({ ok: false, error: "Lien invalide ou expiré." });
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/po/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erreur");
      setConfirmed(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="min-h-dvh"
      style={{ background: "var(--bg-cream)" }}
    >
      {/* Header sapin */}
      <header
        className="gradient-header text-white px-5 py-6 safe-top"
        style={{ borderBottom: "3px solid var(--accent-gold)" }}
      >
        <div className="max-w-xl mx-auto">
          <p
            className="label-caps"
            style={{ color: "var(--accent-gold-bright)", letterSpacing: "0.12em" }}
          >
            Salam Market — K&amp;A Food Toulouse
          </p>
          <h1 className="h2 mt-1 text-white">Confirmation de commande</h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-5 py-6">
        {loading && (
          <div className="card flex items-center gap-3" style={{ padding: 20 }}>
            <Loader2 className="animate-spin" color="var(--primary-green)" />
            <p className="body-md">Chargement de la commande…</p>
          </div>
        )}

        {!loading && data && !data.ok && (
          <div
            className="card text-center"
            style={{ padding: 24, borderColor: "#F4B7B1" }}
          >
            <XCircle size={36} color="var(--danger)" className="mx-auto mb-2" />
            <p className="h3" style={{ color: "var(--danger)" }}>
              Lien invalide
            </p>
            <p className="body-sm mt-1">
              {data.error ?? "Ce lien de confirmation n'est pas valide ou a expiré."}
              <br />
              Contacte Salam Market au 05 XX XX XX XX.
            </p>
          </div>
        )}

        {!loading && data?.ok && data.po && (
          <>
            {confirmed ? (
              <div
                className="card text-center"
                style={{ padding: 28, borderColor: "#B8DEC9", background: "#F1FAF3" }}
              >
                <CheckCircle2 size={48} color="var(--success)" className="mx-auto mb-3" />
                <p className="h2" style={{ color: "var(--success)" }}>
                  Commande confirmée
                </p>
                <p className="body-md mt-2">
                  Merci. <strong>{data.po.numero_po}</strong> est notée comme confirmée
                  côté Salam. On t&apos;attend à <strong>{data.po.depot_nom}</strong>.
                </p>
              </div>
            ) : (
              <>
                <section className="card mb-4" style={{ padding: 18 }}>
                  <p
                    className="label-caps mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Commande {data.po.numero_po}
                  </p>
                  <h2 className="h2 mb-1">{data.po.fournisseur_nom}</h2>
                  <p className="body-sm">
                    <Truck size={13} className="inline mr-1" style={{ verticalAlign: -2 }} />
                    Livraison à{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {data.po.depot_nom}
                    </strong>
                    {data.po.depot_adresse ? ` — ${data.po.depot_adresse}` : ""}
                  </p>
                  {data.po.date_livraison_prevue && (
                    <p className="body-sm mt-1">
                      Date souhaitée :{" "}
                      <strong style={{ color: "var(--text-primary)" }}>
                        {new Date(data.po.date_livraison_prevue).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </strong>
                    </p>
                  )}
                </section>

                <section className="card mb-4" style={{ padding: 0 }}>
                  <div
                    className="px-4 py-3"
                    style={{ borderBottom: "1px solid var(--border-light)" }}
                  >
                    <p
                      className="label-caps"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {data.po.lignes.length} ligne
                      {data.po.lignes.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  <ul>
                    {data.po.lignes.map((l, idx) => (
                      <li
                        key={idx}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                        style={{ borderBottom: "1px solid var(--border-light)" }}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-[14px] font-semibold truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {l.ref ?? "Produit"}
                          </p>
                          <p
                            className="text-[12px]"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {l.qty} × {eur(l.pu)}
                          </p>
                        </div>
                        <p
                          className="text-[14px] font-bold tabular"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {eur(l.total)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div
                    className="px-4 py-3 flex items-center justify-between"
                    style={{ background: "var(--bg-cream)" }}
                  >
                    <p className="font-semibold">Total HT</p>
                    <p
                      className="font-bold tabular text-[18px]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {eur(data.po.total_ht)}
                    </p>
                  </div>
                </section>

                {/* Tag halal */}
                <div className="flex items-center gap-2 mb-4 text-[13px]" style={{ color: "var(--success)" }}>
                  <ShieldCheck size={14} />
                  <span>Certificat halal vérifié au moment de l&apos;envoi.</span>
                </div>

                {/* CTA confirm — gros, full width, sapin */}
                <button
                  type="button"
                  onClick={confirm}
                  disabled={submitting}
                  className="btn-primary w-full"
                  style={{ minHeight: 56, fontSize: 16 }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Envoi…
                    </>
                  ) : (
                    <>
                      <Check size={18} /> Confirmer la commande
                    </>
                  )}
                </button>

                <p
                  className="text-center text-[12px] mt-3"
                  style={{ color: "var(--text-secondary)" }}
                >
                  En confirmant, tu t&apos;engages à livrer cette commande à la date
                  prévue. Toute modification doit être signalée par retour
                  d&apos;email.
                </p>
              </>
            )}
          </>
        )}
      </div>

      <footer
        className="px-5 py-6 text-center"
        style={{ color: "var(--text-tertiary)", fontSize: 12 }}
      >
        <Package size={16} className="inline mr-1" style={{ verticalAlign: -3 }} />
        Salam Market · K&amp;A Food · Toulouse · SIRET 802 773 812
      </footer>
    </main>
  );
}
