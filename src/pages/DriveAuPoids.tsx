import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Receipt,
  Scale,
  ShieldCheck,
  ShoppingBasket,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

// ────────────────────────────────────────────────────────────────────
// DriveAuPoids — page éducation publique (/drive-au-poids)
//
// Objectif : rassurer le client sur le mécanisme de pré-autorisation
// Stripe (estimation × 1,20) + facturation au poids réel. Trois sections :
//   1. Comment ça marche (3 étapes)
//   2. Exemple chiffré (merguez 18 €/kg → 21,60 € autorisés)
//   3. FAQ (3 questions)
// ────────────────────────────────────────────────────────────────────

const DriveAuPoids = () => {
  return (
    <div className="min-h-dvh bg-[#FAF7EE] text-[#0F1A14] flex flex-col">
      <AppHeader showBack title="Drive au poids" />

      <main
        className="flex-1 max-w-3xl w-full mx-auto px-6 md:px-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6rem)" }}
      >
        {/* Hero — typo éditoriale, pas de gradient */}
        <section className="pt-8 pb-10 md:pt-14 md:pb-14">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FBF6E2] border border-[#C9A227]/40 text-[11px] uppercase tracking-[0.18em] font-bold text-[#3E2E0A]">
            <Scale size={12} className="text-[#C9A227]" aria-hidden />
            Drive au poids variable
          </span>
          <h1 className="mt-5 text-[32px] md:text-[44px] leading-[1.1] font-extrabold tracking-[-0.025em] text-[#0E3B2E] max-w-[18ch]">
            Pourquoi un Drive au poids ?
          </h1>
          <p className="mt-4 text-[15px] md:text-[17px] text-[#0F1A14]/75 leading-relaxed max-w-[60ch]">
            Chez Salamarket, la viande, la charcuterie et certains produits
            frais ne s'achètent jamais en quantités identiques d'un client à
            l'autre. Plutôt que d'imposer des poids fixes qui ne correspondent
            à personne, nous pesons votre commande au moment de la préparation,
            et nous vous facturons exactement ce que vous recevez.
          </p>
        </section>

        {/* Section 1 — Comment ça marche */}
        <section className="pb-10">
          <h2 className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-4">
            Comment ça marche
          </h2>
          <div className="grid md:grid-cols-3 gap-3 md:gap-4">
            <StepCard
              step="01"
              icon={<ShoppingBasket size={20} aria-hidden />}
              title="Vous commandez"
              description="Choisissez vos produits et leur poids estimé. Stripe pré-autorise l'estimation majorée de 20 % pour couvrir une éventuelle marge."
            />
            <StepCard
              step="02"
              icon={<Scale size={20} aria-hidden />}
              title="Nous pesons"
              description="Le jour de votre retrait, notre équipe prépare votre commande et pèse précisément ce que vous emportez."
            />
            <StepCard
              step="03"
              icon={<Receipt size={20} aria-hidden />}
              title="Vous êtes débité du poids réel"
              description="Stripe capture uniquement le montant qui correspond au poids effectivement préparé. La différence est libérée sous 7 jours."
            />
          </div>
        </section>

        {/* Section 2 — Exemple chiffré */}
        <section className="pb-10">
          <h2 className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-4">
            Un exemple concret
          </h2>
          <div className="rounded-3xl border border-[#0E3B2E]/15 bg-white p-6 md:p-8 shadow-sm">
            <p className="text-[15px] md:text-[16px] text-[#0F1A14]/80 leading-relaxed">
              Vous commandez{" "}
              <span className="font-bold text-[#0E3B2E]">
                1 kg de merguez à 18 €/kg
              </span>
              .
            </p>
            <ul className="mt-4 space-y-3">
              <ExampleRow
                label="Commande estimée"
                value="18,00 €"
                detail="1 kg × 18 €/kg"
              />
              <ExampleRow
                label="Pré-autorisation Stripe"
                value="21,60 €"
                detail="estimation × 1,20 — marge de sécurité"
                highlight
              />
              <ExampleRow
                label="Poids préparé en magasin"
                value="1,07 kg"
                detail="pesée précise par notre équipe"
              />
              <ExampleRow
                label="Montant débité"
                value="19,26 €"
                detail="1,07 kg × 18 €/kg"
                emphasis
              />
              <ExampleRow
                label="Libéré sous 7 jours"
                value="2,34 €"
                detail="différence pré-autorisé / débité"
              />
            </ul>
            <p className="mt-5 text-[12px] text-[#0F1A14]/55">
              Vous ne payez jamais plus que le poids réel reçu. La
              pré-autorisation est une réservation, pas un prélèvement.
            </p>
          </div>
        </section>

        {/* Section 3 — FAQ */}
        <section className="pb-10">
          <h2 className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-4">
            Questions fréquentes
          </h2>
          <div className="space-y-3">
            <FaqItem
              question="Pourquoi 20 % de marge sur la pré-autorisation ?"
              answer="Pour ajuster au poids exact de votre préparation sans avoir à vous demander un second paiement. Vous ne payez QUE le poids réellement reçu, la différence est automatiquement libérée."
            />
            <FaqItem
              question="Et si j'annule ma commande ?"
              answer="La pré-autorisation est libérée sous 7 jours par votre banque. Aucun montant n'est débité de votre compte. Vous pouvez annuler à tout moment depuis votre espace commandes."
            />
            <FaqItem
              question="Si le poids dépasse l'autorisation, que se passe-t-il ?"
              answer="Si la préparation excède de plus de 20 % votre estimation initiale, nous vous appelons pour confirmer avant de finaliser. Aucune surprise sur la facture."
            />
            <FaqItem
              question="Mes données bancaires sont-elles protégées ?"
              answer="Oui — vos données ne transitent pas par nos serveurs. Le paiement est traité par Stripe (PCI-DSS Level 1), le même prestataire qu'utilisent Uber, Shopify ou Doctolib."
            />
          </div>
        </section>

        {/* CTA retour catalogue */}
        <section className="pb-8">
          <Link
            to="/"
            className="group inline-flex items-center justify-center gap-2 w-full md:w-auto px-6 py-3.5 rounded-full bg-[#0E3B2E] text-white font-bold text-[14px] shadow-md shadow-[#0E3B2E]/25 hover:shadow-lg active:scale-[0.98] transition-all"
          >
            <span>Découvrir le catalogue</span>
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
          <p className="mt-3 text-[12px] text-[#0F1A14]/55 inline-flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-[#C9A227]" aria-hidden />
            Paiement sécurisé Stripe · Drive Salamarket Toulouse
          </p>
        </section>
      </main>
    </div>
  );
};

const StepCard = ({
  step,
  icon,
  title,
  description,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="rounded-3xl border border-[#0E3B2E]/15 bg-white p-5 shadow-sm flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <span className="text-[28px] font-extrabold tabular-nums text-[#C9A227] tracking-[-0.025em] leading-none">
        {step}
      </span>
      <span className="w-10 h-10 rounded-full bg-[#FAF7EE] flex items-center justify-center text-[#0E3B2E]">
        {icon}
      </span>
    </div>
    <h3 className="text-[16px] font-bold text-[#0E3B2E] tracking-[-0.015em]">
      {title}
    </h3>
    <p className="text-[13.5px] text-[#0F1A14]/70 leading-relaxed">
      {description}
    </p>
  </div>
);

const ExampleRow = ({
  label,
  value,
  detail,
  highlight,
  emphasis,
}: {
  label: string;
  value: string;
  detail?: string;
  highlight?: boolean;
  emphasis?: boolean;
}) => (
  <li
    className={`flex items-baseline justify-between gap-3 py-2 ${
      highlight
        ? "px-3 -mx-3 rounded-xl bg-[#FBF6E2] border border-[#C9A227]/30"
        : ""
    }`}
  >
    <div className="flex-1 min-w-0">
      <p
        className={`text-[14px] ${
          emphasis ? "font-extrabold text-[#0E3B2E]" : "text-[#0F1A14]/80"
        }`}
      >
        {label}
      </p>
      {detail && (
        <p className="text-[11.5px] text-[#0F1A14]/55 mt-0.5">{detail}</p>
      )}
    </div>
    <span
      className={`tabular-nums whitespace-nowrap ${
        emphasis
          ? "text-[20px] font-extrabold text-[#0E3B2E] tracking-[-0.02em]"
          : highlight
            ? "text-[16px] font-bold text-[#3E2E0A]"
            : "text-[15px] font-semibold text-[#0F1A14]"
      }`}
    >
      {value}
    </span>
  </li>
);

const FaqItem = ({ question, answer }: { question: string; answer: string }) => (
  <details className="group rounded-2xl border border-[#0E3B2E]/15 bg-white open:border-[#0E3B2E]/40 transition-colors">
    <summary className="flex items-start gap-3 cursor-pointer px-5 py-4 list-none">
      <HelpCircle
        size={18}
        className="shrink-0 mt-0.5 text-[#C9A227] group-open:text-[#0E3B2E] transition-colors"
        aria-hidden
      />
      <span className="flex-1 text-[14.5px] font-bold text-[#0E3B2E] tracking-[-0.01em]">
        {question}
      </span>
      <span
        aria-hidden
        className="shrink-0 mt-0.5 text-[#0E3B2E]/60 group-open:rotate-90 transition-transform"
      >
        <ArrowRight size={16} />
      </span>
    </summary>
    <div className="px-5 pb-5 -mt-2 pl-12 text-[13.5px] text-[#0F1A14]/75 leading-relaxed">
      <p>{answer}</p>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-[#0F1A14]/55">
        <CheckCircle2 size={11} className="text-[#C9A227]" aria-hidden />
        Salamarket s'engage à la transparence sur chaque commande
      </p>
    </div>
  </details>
);

export default DriveAuPoids;
