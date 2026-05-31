import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Code-splitting agressif des dépendances tierces. Sans ça, vite
    // empile React + Supabase + Radix + Lucide + Zustand dans un seul
    // chunk vendor de ~700 KB que le navigateur télécharge même pour
    // un user qui arrive sur /. Séparer permet :
    //   1. Du parallélisme HTTP/2 sur le download initial.
    //   2. Un cache hit long-terme (Supabase change rarement, React
    //      change tous les ans — pas de raison de tout réinvalider).
    //   3. Une analyse de bundle plus parlante.
    //
    // Note : ces chunks ne s'appliquent QU'AUX dependances. Les routes
    // de l'app sont déjà code-splittées via React.lazy() dans App.tsx.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          state: ["zustand", "@tanstack/react-query"],
          icons: ["lucide-react"],
        },
      },
    },
    // Le seuil de warning par défaut est 500 KB, mais le chunk Stripe
    // (~300 KB) et React (~140 KB) restent dans des limites raisonnables
    // séparément. On remonte légèrement le warning pour éviter le bruit
    // de build sur les chunks vendor incompressibles.
    chunkSizeWarningLimit: 600,
  },
}));
