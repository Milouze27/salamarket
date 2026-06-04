import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { reopenCookieBanner } from "@/components/CookieBanner";

/**
 * Politique de confidentialité — RGPD (UE 2016/679) + Loi Informatique
 * et Libertés modifiée. Couvre : responsable de traitement, finalités,
 * base légale, durée de conservation, droits art. 15 à 22, transferts
 * hors UE, cookies (lien vers preferences gérées par CookieBanner).
 */
export default function Confidentialite() {
  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader showBack title="Confidentialité" />
      <main className="max-w-3xl mx-auto px-6 md:px-8 py-10 md:py-14">
        <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-gold mb-3">
          Données personnelles
        </p>
        <h1 className="text-[30px] md:text-[44px] leading-[1.05] tracking-[-0.03em] font-extrabold text-sapin">
          Politique de confidentialité
        </h1>
        <p className="mt-4 text-[14px] text-ink/55">
          Conforme au Règlement Général sur la Protection des Données (UE 2016/679, RGPD) et
          à la loi française n° 78-17 du 6 janvier 1978 modifiée.
        </p>

        <Section title="1. Responsable de traitement">
          <p>
            <strong>K &amp; A FOOD</strong> – SIRET 802 773 812 – est responsable du
            traitement de vos données personnelles collectées via l'application Salamarket
            Drive.
          </p>
          <p>
            Contact :{" "}
            <a
              href="mailto:contact@salamarket.fr"
              className="underline underline-offset-2 text-sapin hover:text-sapin-deep"
            >
              contact@salamarket.fr
            </a>
          </p>
        </Section>

        <Section title="2. Données collectées et finalités">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Compte client</strong> (nom, prénom, email, téléphone) – pour gérer
              votre compte, vous identifier au retrait, vous contacter en cas de problème
              sur la commande. Base légale : exécution du contrat.
            </li>
            <li>
              <strong>Historique de commandes</strong> (produits, dates, montants, créneau) –
              pour le suivi de vos commandes et la facturation. Base légale : exécution du
              contrat + obligation comptable.
            </li>
            <li>
              <strong>Données de paiement</strong> – traitées exclusivement par notre
              prestataire <strong>Stripe</strong>, conforme PCI-DSS. K &amp; A FOOD ne
              stocke jamais vos numéros de carte. Base légale : exécution du contrat.
            </li>
            <li>
              <strong>Données techniques</strong> (logs serveur, type d'appareil, version
              navigateur) – pour la sécurité applicative et la prévention de fraude.
              Base légale : intérêt légitime.
            </li>
            <li>
              <strong>Cookies analytiques et marketing</strong> – uniquement si vous y
              consentez via notre bandeau. Base légale : consentement.
            </li>
          </ul>
        </Section>

        <Section title="3. Durée de conservation">
          <ul className="list-disc pl-5 space-y-2">
            <li>Compte client actif : pendant toute la durée d'utilisation, puis archivé 3 ans après dernière commande.</li>
            <li>Données de facturation : conservées 10 ans (obligation comptable, art. L123-22 Code de commerce).</li>
            <li>Logs techniques : 12 mois.</li>
            <li>Cookies : 13 mois maximum.</li>
          </ul>
        </Section>

        <Section title="4. Destinataires des données">
          <p>
            Vos données ne sont jamais vendues. Elles sont accessibles uniquement à :
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Le personnel habilité de K &amp; A FOOD (préparation, retrait, support).</li>
            <li>
              Nos sous-traitants techniques, dans la limite stricte de leur prestation :
              <ul className="list-[circle] pl-5 mt-1 space-y-1">
                <li><strong>Vercel</strong> (hébergement applicatif, régions EU).</li>
                <li><strong>Supabase</strong> (base de données, région Francfort, UE).</li>
                <li><strong>Stripe</strong> (traitement paiements, certifié PCI-DSS).</li>
                <li><strong>Resend</strong> (envoi des emails transactionnels).</li>
              </ul>
            </li>
          </ul>
        </Section>

        <Section title="5. Transferts hors Union européenne">
          <p>
            Certains de nos sous-traitants (Vercel, Stripe) sont des sociétés américaines.
            Les transferts éventuels sont encadrés par les <strong>Clauses Contractuelles
            Types</strong> de la Commission européenne et, lorsque applicable, par le
            <strong> Data Privacy Framework</strong>.
          </p>
        </Section>

        <Section title="6. Vos droits (articles 15 à 22 RGPD)">
          <p>Vous disposez à tout moment des droits suivants sur vos données :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Droit d'accès</strong> – obtenir une copie de vos données.</li>
            <li><strong>Droit de rectification</strong> – corriger une donnée inexacte.</li>
            <li><strong>Droit à l'effacement</strong> – demander la suppression (« droit à l'oubli »).</li>
            <li><strong>Droit à la limitation</strong> du traitement.</li>
            <li><strong>Droit à la portabilité</strong> – récupérer vos données dans un format structuré.</li>
            <li><strong>Droit d'opposition</strong> à un traitement fondé sur l'intérêt légitime.</li>
            <li>
              <strong>Droit de retirer votre consentement</strong> à tout moment pour les
              traitements qui en sont basés (notamment cookies).
            </li>
          </ul>
          <p>
            Pour exercer ces droits, écrivez à{" "}
            <a
              href="mailto:contact@salamarket.fr"
              className="underline underline-offset-2 text-sapin hover:text-sapin-deep"
            >
              contact@salamarket.fr
            </a>
            {" "}en précisant votre demande et en joignant un justificatif d'identité.
            Réponse sous 30 jours maximum.
          </p>
        </Section>

        <Section title="7. Réclamation auprès de la CNIL">
          <p>
            En cas de désaccord sur le traitement de vos données, vous pouvez introduire
            une réclamation auprès de la{" "}
            <a
              href="https://www.cnil.fr/fr/plaintes"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 text-sapin hover:text-sapin-deep"
            >
              Commission Nationale de l'Informatique et des Libertés (CNIL)
            </a>
            , 3 Place de Fontenoy, 75007 Paris.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            Notre site utilise plusieurs catégories de cookies :
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Cookies nécessaires</strong> – indispensables au fonctionnement
              (session, panier, sécurité). Pas de consentement requis (art. 82 loi
              Informatique et Libertés).
            </li>
            <li>
              <strong>Cookies analytiques</strong> – pour mesurer l'audience de manière
              anonymisée. Soumis à votre consentement.
            </li>
            <li>
              <strong>Cookies marketing</strong> – pour personnaliser nos communications.
              Soumis à votre consentement.
            </li>
          </ul>
          <p>
            Vous pouvez à tout moment modifier ou retirer votre consentement. Pour plus de
            détails sur le cadre contractuel, consultez nos{" "}
            <Link
              to="/cgv"
              className="underline underline-offset-2 text-sapin hover:text-sapin-deep font-medium"
            >
              CGV
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={reopenCookieBanner}
            className="mt-1 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-sapin/5 text-sapin font-semibold text-[14px] hover:bg-sapin/10 active:scale-[0.98] transition-all"
          >
            <Cookie size={16} aria-hidden />
            Gérer mes préférences cookies
          </button>
        </Section>

        <Section title="9. Sécurité">
          <p>
            Nous mettons en œuvre des mesures techniques et organisationnelles adaptées :
            chiffrement TLS, contrôle d'accès par rôles, journalisation des accès aux
            données sensibles, sauvegardes régulières, durcissement des politiques RLS au
            niveau base de données. En cas de violation de données, la CNIL et les
            personnes concernées seront informées dans les conditions prévues aux articles
            33 et 34 du RGPD.
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] md:text-[20px] font-bold text-sapin tracking-[-0.01em] mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-[1.65] text-ink/80">
        {children}
      </div>
    </section>
  );
}
