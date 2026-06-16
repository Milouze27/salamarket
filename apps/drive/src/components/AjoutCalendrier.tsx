import { BRAND } from "@/config/brand";
import { useHaptic } from "@/hooks/useHaptic";

// Ajout du créneau de retrait à l'agenda. Génère un fichier .ics 100 %
// côté client (Blob, aucun appel réseau) et le propose au téléchargement.
// Données issues de la commande affichée.

interface AjoutCalendrierProps {
  slotStart: string;
  slotEnd: string;
  /** Numéro court de commande, pour le titre et la description. */
  orderShortId: string;
}

// Identifiant marque réutilisé pour le PRODID, l'UID iCalendar et le nom du
// fichier — dérivé de BRAND (jamais en dur) : "Salamarket Drive" → "salamarket".
const ICS_SLUG = BRAND.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Format iCalendar UTC : 20260616T143000Z. On part de l'instant absolu
// (les bornes du créneau sont des ISO 8601 avec fuseau), donc l'agenda de
// l'utilisateur l'affichera dans SA timezone — correct pour un retrait local.
function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Échappe les caractères réservés du format iCalendar (RFC 5545).
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function buildIcs({ slotStart, slotEnd, orderShortId }: AjoutCalendrierProps) {
  const location = `${BRAND.store.name}, ${BRAND.store.address}, ${BRAND.store.postalCode} ${BRAND.store.city}`;
  const summary = `Retrait ${BRAND.name} — commande ${orderShortId}`;
  const description = `Retrait de votre commande ${orderShortId} chez ${BRAND.name}. Présentez ce numéro au comptoir.`;
  const stamp = toIcsUtc(new Date().toISOString());

  // Lignes CRLF + UID stable par commande (pas de doublon si réajout).
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${BRAND.name}//Retrait//FR`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:retrait-${orderShortId}@${ICS_SLUG}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(slotStart)}`,
    `DTEND:${toIcsUtc(slotEnd)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(location)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function AjoutCalendrier(props: AjoutCalendrierProps) {
  const haptic = useHaptic();

  const handleDownload = () => {
    haptic();
    const ics = buildIcs(props);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `retrait-${ICS_SLUG}-${props.orderShortId}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex min-h-[44px] items-center text-[14px] font-semibold text-sapin underline underline-offset-[6px] decoration-gold/60 decoration-[1.5px] hover:decoration-gold transition-colors"
    >
      Ajouter à mon agenda
    </button>
  );
}
