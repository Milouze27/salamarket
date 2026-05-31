import { Link } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BRAND } from "@/config/brand";

/**
 * Page "À propos" — récit court de la marque K & A FOOD, raison d'être
 * Salamarket, ancrage Toulouse, exigence halal. Volontairement éditorial
 * (pas commercial), un seul typeface (Plus Jakarta Sans, règle marque).
 */
export default function About() {
  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader showBack title="À propos" />
      <main className="max-w-3xl mx-auto px-6 md:px-8 py-10 md:py-14">
        <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#C9A227] mb-3">
          La maison
        </p>
        <h1 className="text-[34px] md:text-[52px] leading-[1.02] tracking-[-0.035em] font-extrabold text-[#0E3B2E]">
          Indépendant. De Toulouse. Halal.
        </h1>

        <div className="mt-10 space-y-6 text-[16px] leading-[1.7] text-[#0F1A14]/80">
          <p>
            <span className="font-semibold text-[#0E3B2E]">Salamarket</span> est l'enseigne
            de drive halal opérée par <strong>K &amp; A FOOD</strong>, société indépendante
            installée à Toulouse, quartier {BRAND.store.city}. Nous tenons un seul magasin,
            au {BRAND.store.address}, et nous y mettons un point d'honneur à choisir nous-mêmes
            chaque produit qui passe sur nos étals.
          </p>
          <p>
            Notre conviction est simple : <strong>la rigueur halal n'est pas un argument
            marketing, c'est un standard de travail.</strong> Chaque lot de boucherie et de
            charcuterie est tracé jusqu'à l'abattoir, et nous publions cette traçabilité en
            clair, accessible via le QR code imprimé sur votre ticket.
          </p>
          <p>
            En lançant le Drive, notre objectif est de rendre les courses moins éprouvantes :
            commande la veille, retrait en magasin sur un créneau choisi, pas d'attente.
            Le frais, la boucherie et la charcuterie restent préparés du jour ; le reste est
            réservé pour vous dès la validation.
          </p>
          <p>
            Nous écoutons les retours et nous corrigeons vite. Pour toute remarque, écrivez-nous
            via la page <Link to="/mentions-legales" className="underline underline-offset-2 text-[#0E3B2E] hover:text-[#082A20]">Mentions légales</Link>.
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-[#0E3B2E]/12">
          <p className="text-[12px] uppercase tracking-[0.28em] font-bold text-[#0E3B2E]/60 mb-3">
            En résumé
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-[14px]">
            <div>
              <dt className="font-semibold text-[#0E3B2E]">Enseigne</dt>
              <dd className="text-[#0F1A14]/75 mt-0.5">Salamarket Drive</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#0E3B2E]">Société</dt>
              <dd className="text-[#0F1A14]/75 mt-0.5">K &amp; A FOOD</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#0E3B2E]">SIRET</dt>
              <dd className="text-[#0F1A14]/75 mt-0.5 tabular-nums">802 773 812</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#0E3B2E]">Magasin unique</dt>
              <dd className="text-[#0F1A14]/75 mt-0.5">
                {BRAND.store.address}, {BRAND.store.postalCode} {BRAND.store.city}
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
