// Salutation horaire — source unique partagée par le Header et le
// SalutationHero pour garantir la cohérence à toute heure (avant : deux
// découpages divergents donnaient "Bonjour"/"Bon après-midi" en même temps
// l'après-midi). Découpage : matin < 12h, après-midi < 18h, sinon soir.
// Date locale = celle du client, pas de gestion de fuseau.
export const greetingForHour = (hour: number): string => {
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
};
