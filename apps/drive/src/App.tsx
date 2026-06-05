import { Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/providers/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { RouteChrome } from "@/components/RouteChrome";
import { RoutedErrorBoundary } from "@/components/RoutedErrorBoundary";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OnboardingGate } from "@/components/OnboardingGate";

// Routes critiques (chemin chaud client) — chargées eager pour pas
// pénaliser le 1st paint sur l'écran d'accueil et la connexion. Le
// reste (PDP, panier, paiement, etc.) est lazy : un user qui arrive
// sur la home doit pouvoir scroller le catalogue avant que le code des
// pages secondaires ne soit téléchargé.
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Signup from "./pages/Signup.tsx";
import NotFound from "./pages/NotFound.tsx";

// Routes secondaires — lazy load. Évite ~400-500 KB sur le bundle
// initial. Stripe / Supabase admin / auth pages restent invisibles
// tant que le user ne navigue pas dessus.
const ProductDetail = lazyWithRetry(() => import("./pages/ProductDetail.tsx"));
const Cart = lazyWithRetry(() => import("./pages/Cart.tsx"));
const Slots = lazyWithRetry(() => import("./pages/Slots.tsx"));
const DriveAuPoids = lazyWithRetry(() => import("./pages/DriveAuPoids.tsx"));
const LotPublic = lazyWithRetry(() => import("./pages/LotPublic.tsx"));
const Checkout = lazyWithRetry(() => import("./pages/Checkout.tsx"));
const OrderConfirmation = lazyWithRetry(
  () => import("./pages/OrderConfirmation.tsx"),
);
const Account = lazyWithRetry(() => import("./pages/Account.tsx"));
const Orders = lazyWithRetry(() => import("./pages/Orders.tsx"));
const MotDePasseOublie = lazyWithRetry(
  () => import("./pages/MotDePasseOublie.tsx"),
);
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword.tsx"));
const Admin = lazyWithRetry(() => import("./pages/Admin.tsx"));
const AdminSettings = lazyWithRetry(() => import("./pages/AdminSettings.tsx"));
const EmployeeKanban = lazyWithRetry(
  () => import("./pages/EmployeeKanban.tsx"),
);

// Module Labo (recettes BOM + productions + marges) — admin + employee
const LaboHome = lazyWithRetry(() => import("./pages/labo/LaboHome.tsx"));
const LaboRecettes = lazyWithRetry(() => import("./pages/labo/Recettes.tsx"));
const LaboRecetteDetail = lazyWithRetry(
  () => import("./pages/labo/RecetteDetail.tsx"),
);
const LaboRecetteNouvelle = lazyWithRetry(
  () => import("./pages/labo/RecetteNouvelle.tsx"),
);
const LaboProductions = lazyWithRetry(
  () => import("./pages/labo/Productions.tsx"),
);
const LaboProductionDetail = lazyWithRetry(
  () => import("./pages/labo/ProductionDetail.tsx"),
);
const LaboProductionNouvelle = lazyWithRetry(
  () => import("./pages/labo/ProductionNouvelle.tsx"),
);
const LaboMarges = lazyWithRetry(() => import("./pages/labo/Marges.tsx"));

// Module Drive Pro — public (auth obligatoire au-delà de inscription/login)
const ProInscription = lazyWithRetry(
  () => import("./pages/pro/Inscription.tsx"),
);
const ProLogin = lazyWithRetry(() => import("./pages/pro/Login.tsx"));
const ProCatalogue = lazyWithRetry(() => import("./pages/pro/Catalogue.tsx"));
const ProPanier = lazyWithRetry(() => import("./pages/pro/Panier.tsx"));
const ProCommandes = lazyWithRetry(() => import("./pages/pro/Commandes.tsx"));
const ProCommandeDetail = lazyWithRetry(
  () => import("./pages/pro/CommandeDetail.tsx"),
);
const ProFactures = lazyWithRetry(() => import("./pages/pro/Factures.tsx"));
const ProCompte = lazyWithRetry(() => import("./pages/pro/Compte.tsx"));

// Module Drive Pro — admin (admin + manager)
const AdminComptesPro = lazyWithRetry(
  () => import("./pages/admin/ComptesPro.tsx"),
);
const AdminCommandesPro = lazyWithRetry(
  () => import("./pages/admin/CommandesPro.tsx"),
);
const AdminFacturesPro = lazyWithRetry(
  () => import("./pages/admin/FacturesPro.tsx"),
);

// Pages légales — chargées lazy, faible traffic, jamais sur le chemin chaud
const LegalAbout = lazyWithRetry(() => import("./pages/legal/About.tsx"));
const LegalMentions = lazyWithRetry(() => import("./pages/legal/Mentions.tsx"));
const LegalCGV = lazyWithRetry(() => import("./pages/legal/CGV.tsx"));
const LegalConfidentialite = lazyWithRetry(
  () => import("./pages/legal/Confidentialite.tsx"),
);

// React Query — defaults raisonnés. Sans staleTime, chaque mount refetch
// → flicker visuel + bande passante gaspillée + jank au focus window.
// 60s = compromis raisonnable pour un catalogue qui bouge peu, gcTime
// 5min pour garder les pages déjà visitées chaudes en cache.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-dvh bg-[#FAF7EE] flex items-center justify-center">
    <Loader2
      className="h-8 w-8 text-[#0F4C3A] animate-spin"
      aria-label="Chargement"
    />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RoutedErrorBoundary>
          <AuthProvider>
            <OnboardingGate />
            <InstallPrompt />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                {/* /catalogue : alias SEO-friendly de la home. Référencé
                    depuis l'empty state du panier B2C, anciens emails et
                    QR prints (avant le rebranding Drive). On garde la
                    redirect 301 logique côté client pour ne plus 404. */}
                <Route
                  path="/catalogue"
                  element={<Navigate to="/" replace />}
                />
                <Route path="/produit/:id" element={<ProductDetail />} />
                <Route path="/panier" element={<Cart />} />
                <Route path="/creneaux" element={<Slots />} />
                <Route path="/drive-au-poids" element={<DriveAuPoids />} />
                <Route path="/lot/:id" element={<LotPublic />} />
                <Route
                  path="/paiement"
                  element={
                    <ProtectedRoute>
                      <Checkout />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/commande/confirmee/:orderId"
                  element={
                    <ProtectedRoute>
                      <OrderConfirmation />
                    </ProtectedRoute>
                  }
                />
                <Route path="/connexion" element={<Login />} />
                <Route path="/inscription" element={<Signup />} />
                <Route
                  path="/mot-de-passe-oublie"
                  element={<MotDePasseOublie />}
                />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route
                  path="/compte"
                  element={
                    <ProtectedRoute>
                      <Account />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/commandes"
                  element={
                    <ProtectedRoute>
                      <Orders />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RoleProtectedRoute requiredRole="admin">
                      <Admin />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin/reglages"
                  element={
                    <RoleProtectedRoute requiredRole="admin">
                      <AdminSettings />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/employe"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <EmployeeKanban />
                    </RoleProtectedRoute>
                  }
                />
                {/* ───────────── Module Labo ───────────── */}
                <Route
                  path="/v2/labo"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <LaboHome />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/v2/labo/recettes"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <LaboRecettes />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/v2/labo/recettes/nouvelle"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <LaboRecetteNouvelle />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/v2/labo/recettes/:id"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <LaboRecetteDetail />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/v2/labo/productions"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <LaboProductions />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/v2/labo/productions/nouvelle"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <LaboProductionNouvelle />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/v2/labo/productions/:id"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <LaboProductionDetail />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/v2/labo/marges"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "employee"]}>
                      <LaboMarges />
                    </RoleProtectedRoute>
                  }
                />
                {/* ───────────── Drive Pro — public ───────────── */}
                <Route path="/pro/inscription" element={<ProInscription />} />
                <Route path="/pro/login" element={<ProLogin />} />
                {/* Drive Pro — authentifié (ProCompteActifGuard interne gère le statut compte) */}
                <Route
                  path="/pro/catalogue"
                  element={
                    <ProtectedRoute>
                      <ProCatalogue />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pro/panier"
                  element={
                    <ProtectedRoute>
                      <ProPanier />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pro/commandes"
                  element={
                    <ProtectedRoute>
                      <ProCommandes />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pro/commande/:id"
                  element={
                    <ProtectedRoute>
                      <ProCommandeDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pro/factures"
                  element={
                    <ProtectedRoute>
                      <ProFactures />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pro/compte"
                  element={
                    <ProtectedRoute>
                      <ProCompte />
                    </ProtectedRoute>
                  }
                />
                {/* ───────────── Drive Pro — admin (admin + manager) ───────────── */}
                <Route
                  path="/admin/comptes-pro"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "manager"]}>
                      <AdminComptesPro />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin/commandes-pro"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "manager"]}>
                      <AdminCommandesPro />
                    </RoleProtectedRoute>
                  }
                />
                <Route
                  path="/admin/factures-pro"
                  element={
                    <RoleProtectedRoute requiredRoles={["admin", "manager"]}>
                      <AdminFacturesPro />
                    </RoleProtectedRoute>
                  }
                />
                {/* ───────────── Pages légales (publiques) ───────────── */}
                <Route path="/a-propos" element={<LegalAbout />} />
                <Route path="/mentions-legales" element={<LegalMentions />} />
                <Route path="/cgv" element={<LegalCGV />} />
                <Route
                  path="/confidentialite"
                  element={<LegalConfidentialite />}
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <RouteChrome />
          </AuthProvider>
        </RoutedErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
