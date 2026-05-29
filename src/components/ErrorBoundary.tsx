import { Component, ReactNode, ErrorInfo } from "react";
import { BRAND } from "@/config/brand";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            flexDirection: "column",
            gap: 20,
            padding: 24,
            background: BRAND.colors.bg,
            color: BRAND.colors.text,
            fontFamily: BRAND.font,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "1.6em", fontWeight: 700 }}>
            Une erreur est survenue
          </div>
          <div style={{ fontSize: "1em", color: BRAND.colors.muted, maxWidth: 420 }}>
            Désolé, l'application a rencontré un problème. Recharge la page ou reviens dans quelques instants.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: BRAND.colors.primary,
              color: "white",
              padding: "12px 24px",
              borderRadius: 12,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: BRAND.font,
            }}
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
