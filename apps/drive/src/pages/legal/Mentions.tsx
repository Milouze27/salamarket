import { AppHeader } from "@/components/AppHeader";
import { BRAND } from "@/config/brand";

/**
 * Mentions légales — obligation LCEN (Loi pour la Confiance dans
 * l'Économie Numérique, art. 6-III). Identification éditeur,
 * hébergeur, directeur de publication, contact, propriété
 * intellectuelle.
 */
export default function Mentions() {
  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader showBack title="Mentions légales" />
      <main className="max-w-3xl mx-auto px-6 md:px-8 py-10 md:py-14">
        <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#C9A227] mb-3">
          Information légale
        </p>
        <h1 className="text-[30px] md:text-[44px] leading-[1.05] tracking-[-0.03em] font-extrabold text-[#0E3B2E]">
          Mentions légales
        </h1>
        <p className="mt-4 text-[14px] text-[#0F1A14]/55">
          Conformément aux dispositions de l'article 6-III de la loi n° 2004-575 du 21 juin 2004
          pour la confiance dans l'économie numérique.
        </p>

        <Section title="Éditeur du site">
          <p>
            <strong>K &amp; A FOOD</strong> – Société exploitant l'enseigne <strong>Salamarket</strong>.
          </p>
          <p>SIRET : 802 773 812</p>
          <p>
            Adresse : {BRAND.store.address}, {BRAND.store.postalCode} {BRAND.store.city}, France
          </p>
          <p>
            Contact :{" "}
            <a
              href="mailto:contact@salamarket.fr"
              className="underline underline-offset-2 text-[#0E3B2E] hover:text-[#082A20]"
            >
              contact@salamarket.fr
            </a>
          </p>
        </Section>

        <Section title="Directeur de la publication">
          <p>Représentant légal de K &amp; A FOOD.</p>
        </Section>

        <Section title="Hébergement">
          <p>
            Application web et infrastructure backend hébergées en Union européenne par les
            prestataires suivants :
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Vercel Inc.</strong> – 440 N Barranca Ave #4133, Covina, CA 91723, USA
              (régions de calcul EU activées).
              <br />
              Site :{" "}
              <a
                href="https://vercel.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 text-[#0E3B2E] hover:text-[#082A20]"
              >
                vercel.com
              </a>
            </li>
            <li>
              <strong>Supabase</strong> – base de données et stockage applicatif (région
              Europe, Francfort).
              <br />
              Site :{" "}
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 text-[#0E3B2E] hover:text-[#082A20]"
              >
                supabase.com
              </a>
            </li>
          </ul>
        </Section>

        <Section title="Propriété intellectuelle">
          <p>
            L'ensemble des contenus présents sur ce site (textes, photographies, identité
            graphique, code source, logos) est la propriété exclusive de K &amp; A FOOD ou
            cédé sous licence à K &amp; A FOOD. Toute reproduction, représentation ou
            diffusion, totale ou partielle, sans autorisation écrite préalable est interdite.
          </p>
        </Section>

        <Section title="Liens hypertextes">
          <p>
            Le site peut renvoyer vers des sites tiers (réseaux sociaux, partenaires).
            K &amp; A FOOD n'exerce aucun contrôle sur le contenu de ces sites et décline
            toute responsabilité quant à leur fonctionnement.
          </p>
        </Section>

        <Section title="Droit applicable">
          <p>
            Le présent site est régi par le droit français. Tout litige sera porté devant
            les juridictions compétentes du ressort de Toulouse, sous réserve des dispositions
            impératives du Code de la consommation.
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
