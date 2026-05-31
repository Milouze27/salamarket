import { Link } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BRAND } from "@/config/brand";

/**
 * CGV — Conditions Générales de Vente.
 * Cadre : vente B2C alimentaire en click & collect (retrait magasin).
 * Pas de livraison. Pré-autorisation Stripe + capture au retrait
 * (cf. WORKFLOW.md). Droit de rétractation : exclusion alimentaire
 * périssable (art. L221-28 4° du Code de la consommation).
 */
export default function CGV() {
  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader showBack title="CGV" />
      <main className="max-w-3xl mx-auto px-6 md:px-8 py-10 md:py-14">
        <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#C9A227] mb-3">
          Cadre contractuel
        </p>
        <h1 className="text-[30px] md:text-[44px] leading-[1.05] tracking-[-0.03em] font-extrabold text-[#0E3B2E]">
          Conditions générales de vente
        </h1>
        <p className="mt-4 text-[14px] text-[#0F1A14]/55">
          Applicables à toute commande passée sur Salamarket Drive depuis le 1ᵉʳ janvier 2026.
        </p>

        <Section title="1. Objet et champ d'application">
          <p>
            Les présentes Conditions Générales de Vente (CGV) régissent l'ensemble des
            relations contractuelles entre <strong>K &amp; A FOOD</strong> (SIRET 802 773 812),
            exploitant l'enseigne <strong>Salamarket Drive</strong>, et le client (ci-après
            « vous »). Toute commande implique l'acceptation pleine et entière des présentes.
          </p>
        </Section>

        <Section title="2. Service proposé">
          <p>
            Salamarket Drive est un service de <strong>vente à distance avec retrait en
            magasin</strong> (click &amp; collect). Aucune livraison n'est assurée.
          </p>
          <p>
            Le retrait s'effectue exclusivement à l'adresse :
            <br />
            <span className="font-medium text-[#0E3B2E]">
              {BRAND.store.name}, {BRAND.store.address}, {BRAND.store.postalCode} {BRAND.store.city}.
            </span>
          </p>
        </Section>

        <Section title="3. Commande et créneau de retrait">
          <p>
            Vous sélectionnez vos produits, puis choisissez un créneau de retrait disponible.
            Votre commande est ferme dès validation du paiement.
          </p>
          <p>
            Les créneaux sont proposés sous réserve de disponibilité. Salamarket se réserve
            le droit de refuser une commande en cas de rupture de stock manifeste ou de
            saturation logistique.
          </p>
        </Section>

        <Section title="4. Prix">
          <p>
            Les prix sont indiqués en euros, toutes taxes comprises (TTC), TVA française
            applicable. Les produits vendus au poids sont facturés sur la base du poids réel
            pesé en magasin lors de la préparation.
          </p>
        </Section>

        <Section title="5. Paiement">
          <p>
            Le paiement est effectué en ligne par carte bancaire via notre prestataire
            certifié PCI-DSS <strong>Stripe</strong>.
          </p>
          <p>
            <strong>Pré-autorisation au moment de la commande :</strong> votre carte fait
            l'objet d'une empreinte (pré-autorisation) pour le montant estimé. Aucun débit
            réel n'intervient à ce stade.
          </p>
          <p>
            <strong>Capture au retrait :</strong> le débit définitif n'est déclenché qu'au
            retrait effectif de la commande, sur la base du <strong>poids réel pesé</strong>
            {" "}des produits au poids et des éventuels ajustements (rupture sur un produit
            substitué ou retiré, accord du client). Le montant capturé peut donc différer
            légèrement du montant pré-autorisé.
          </p>
        </Section>

        <Section title="6. Retrait de la commande">
          <p>
            La commande doit être retirée pendant le créneau choisi. Une pièce d'identité
            peut être demandée. À défaut de retrait sous 48h après le créneau, la commande
            est considérée comme annulée et la pré-autorisation libérée.
          </p>
        </Section>

        <Section title="7. Produits halal et traçabilité">
          <p>
            Tous les produits de boucherie et de charcuterie vendus sont certifiés halal.
            Chaque lot est tracé jusqu'à l'abattoir de provenance. La traçabilité est
            accessible publiquement via le QR code imprimé sur votre ticket de retrait.
          </p>
        </Section>

        <Section title="8. Droit de rétractation">
          <p>
            Conformément à l'article <strong>L221-28 4° du Code de la consommation</strong>,
            le droit de rétractation ne s'applique pas aux denrées alimentaires périssables,
            aux produits descellés après livraison ne pouvant être renvoyés pour des raisons
            d'hygiène, ni aux produits confectionnés à la demande.
          </p>
          <p>
            Pour les autres produits, vous disposez d'un délai de 14 jours à compter du
            retrait pour exercer votre droit de rétractation, en nous contactant à{" "}
            <a
              href="mailto:contact@salamarket.fr"
              className="underline underline-offset-2 text-[#0E3B2E] hover:text-[#082A20]"
            >
              contact@salamarket.fr
            </a>
            .
          </p>
        </Section>

        <Section title="9. Réclamation et garantie légale">
          <p>
            Tout produit présentant un défaut manifeste constaté au retrait doit être signalé
            immédiatement au personnel du magasin. Vous bénéficiez de la garantie légale de
            conformité (art. L217-3 et suivants du Code de la consommation) et de la garantie
            des vices cachés (art. 1641 du Code civil).
          </p>
        </Section>

        <Section title="10. Données personnelles">
          <p>
            Le traitement des données personnelles collectées dans le cadre de votre commande
            est régi par notre{" "}
            <Link
              to="/confidentialite"
              className="underline underline-offset-2 text-[#0E3B2E] hover:text-[#082A20] font-medium"
            >
              Politique de confidentialité
            </Link>
            .
          </p>
        </Section>

        <Section title="11. Médiation et juridiction">
          <p>
            En cas de litige non résolu à l'amiable, vous pouvez recourir gratuitement au
            service de médiation de la consommation. À défaut, les tribunaux du ressort de
            Toulouse seront seuls compétents, sous réserve des règles impératives de
            compétence applicables au consommateur.
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] md:text-[20px] font-bold text-[#0E3B2E] tracking-[-0.01em] mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-[1.65] text-[#0F1A14]/80">
        {children}
      </div>
    </section>
  );
}
