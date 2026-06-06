"use client";

import { useEffect, useState } from "react";

/**
 * UpdatePrompt — bannière discrète "Nouvelle version disponible".
 *
 * SWRegister.tsx (cf. components/SWRegister.tsx) dispatch un
 * CustomEvent('sw-update-available') dès qu'un nouveau Service Worker est
 * installé et en attente. Personne ne l'écoutait → la nouvelle version ne
 * s'activait qu'à la fermeture de tous les onglets (rare sur une PWA staff
 * iPad qui reste ouverte des jours).
 *
 * Ce composant écoute cet event et propose à l'utilisateur de recharger.
 * Au clic, on dispatch 'sw-activate-update' : SWRegister envoie alors
 * {type:"SKIP_WAITING"} au SW en attente puis recharge la page sur le
 * 'controllerchange'. On ne fait QUE dispatcher l'event ici — toute la
 * mécanique postMessage/reload vit déjà dans SWRegister (source unique).
 */
export function UpdatePrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onUpdate = () => setVisible(true);
    window.addEventListener("sw-update-available", onUpdate);
    return () => window.removeEventListener("sw-update-available", onUpdate);
  }, []);

  if (!visible) return null;

  const reload = () => {
    // Délègue à SWRegister : SKIP_WAITING + reload sur controllerchange.
    window.dispatchEvent(new CustomEvent("sw-activate-update"));
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        // Au-dessus de la nav (z 40) / FAB (z 50), sous les modals.
        zIndex: 55,
        // Ancré bas, au-dessus de la safe-area home indicator + nav.
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)",
        maxWidth: "min(420px, calc(100vw - 32px))",
        width: "max-content",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "12px 12px 12px 18px",
        borderRadius: "9999px",
        background: "var(--surface-3, #1f3d2f)",
        color: "var(--text-primary, #f3f0e6)",
        border: "1px solid var(--accent-gold-hairline, rgba(201,162,39,0.24))",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        fontFamily: "var(--font-jakarta), system-ui, sans-serif",
        fontSize: "14px",
        fontWeight: 500,
      }}
    >
      <span style={{ whiteSpace: "nowrap" }}>Nouvelle version disponible</span>
      <button
        type="button"
        onClick={reload}
        style={{
          flexShrink: 0,
          appearance: "none",
          border: "none",
          cursor: "pointer",
          padding: "8px 18px",
          minHeight: "40px",
          borderRadius: "9999px",
          background: "var(--accent-gold, #c9a227)",
          color: "var(--text-on-gold, #0a1f18)",
          fontFamily: "inherit",
          fontSize: "14px",
          fontWeight: 700,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Recharger
      </button>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Plus tard"
        style={{
          flexShrink: 0,
          appearance: "none",
          border: "none",
          cursor: "pointer",
          width: "36px",
          minHeight: "36px",
          borderRadius: "9999px",
          background: "transparent",
          color: "var(--text-secondary, #b9c4bd)",
          fontFamily: "inherit",
          fontSize: "18px",
          lineHeight: 1,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        ✕
      </button>
    </div>
  );
}
