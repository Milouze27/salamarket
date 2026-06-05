/**
 * Constantes métier partagées côté Drive (B2C).
 *
 * Source unique de vérité pour les seuils dupliqués dans plusieurs écrans.
 * Avant : MIN_ORDER_CENTS était redéclaré en dur dans Cart.tsx et
 * Checkout.tsx — un changement de seuil oubliait toujours l'un des deux.
 */

/** Montant minimum de commande, en centimes (15,00 €). */
export const MIN_ORDER_CENTS = 1500;
