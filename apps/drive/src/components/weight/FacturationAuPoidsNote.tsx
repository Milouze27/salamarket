import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ────────────────────────────────────────────────────────────────────
// FacturationAuPoidsNote — encart dépliable « Comment on facture au poids
// réel », posé sous le sélecteur de poids sur la PDP weight.
//
// Reprend la promesse de /drive-au-poids en version courte inline (3 lignes :
// pré-autorisation / pesée / ajustement). Texte pur, bord hairline, fond
// surface. Le chevron est FONCTIONNEL (il pilote l'ouverture) → autorisé par
// la règle design ; aucun picto décoratif ailleurs.
//
// S'appuie sur Radix Collapsible (déjà dans le projet) — accessible par
// défaut (aria-expanded, contrôle clavier). L'animation height utilise les
// keyframes accordion-down/up déjà configurées dans tailwind.config.
// ────────────────────────────────────────────────────────────────────

const STEPS: { label: string; text: string }[] = [
  {
    label: "Pré-autorisation",
    text: "à la commande, on réserve l'estimation majorée de 20 % — une simple empreinte, jamais un débit.",
  },
  {
    label: "Pesée en magasin",
    text: "le jour du retrait, notre équipe pèse précisément ce que vous emportez.",
  },
  {
    label: "Ajustement",
    text: "vous n'êtes débité que du poids réel. La différence est libérée sous 7 jours.",
  },
];

export const FacturationAuPoidsNote = () => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mt-4 rounded-2xl border border-[#0E3B2E]/12 bg-white overflow-hidden"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-[#FAF7EE]/60 transition-colors">
        <span className="text-[13.5px] font-bold text-[#0E3B2E] tracking-[-0.01em]">
          Comment on facture au poids réel
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className="shrink-0 text-[#0E3B2E]/55 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
        <div className="px-4 pb-4 pt-0.5">
          <ol className="space-y-2.5">
            {STEPS.map((s) => (
              <li key={s.label} className="text-[13px] leading-relaxed">
                <span className="font-semibold text-[#0E3B2E]">{s.label}</span>
                <span className="text-[#0F1A14]/70"> — {s.text}</span>
              </li>
            ))}
          </ol>
          <Link
            to="/drive-au-poids"
            className="mt-3 inline-block text-[12px] font-semibold text-[#0E3B2E] underline underline-offset-2 hover:text-[#082A20]"
          >
            Tout comprendre sur le Drive au poids
          </Link>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
