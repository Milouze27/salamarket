"use client";

import * as Sentry from "@sentry/nextjs";
import { resetAppStorage } from "@/lib/utils/safe-storage";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: "global-error" } });
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#FAF7EE",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Plus Jakarta Sans", sans-serif',
        }}
      >
        <div style={{ maxWidth: "420px", textAlign: "center" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "9999px",
              backgroundColor: "#0E3B2E",
              color: "#C9A227",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" x2="12" y1="9" y2="13" />
              <line x1="12" x2="12.01" y1="17" y2="17" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "#0E3B2E",
              marginBottom: "8px",
            }}
          >
            Une erreur est survenue
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#5C6660",
              marginBottom: "24px",
              lineHeight: 1.5,
            }}
          >
            L&apos;application a rencontré un problème inattendu. Vous pouvez
            réessayer ou réinitialiser l&apos;application.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              onClick={() => reset()}
              style={{
                width: "100%",
                height: "48px",
                borderRadius: "14px",
                border: "none",
                backgroundColor: "#0E3B2E",
                color: "#FFFFFF",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Réessayer
            </button>
            <button
              onClick={() => {
                resetAppStorage();
                window.location.href = "/v2";
              }}
              style={{
                width: "100%",
                height: "44px",
                borderRadius: "14px",
                border: "1px solid #D9D4C7",
                backgroundColor: "transparent",
                color: "#0E3B2E",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Réinitialiser l&apos;application
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
