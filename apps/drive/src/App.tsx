import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/providers/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OnboardingGate } from "@/components/OnboardingGate";
import { BottomNav } from "@/components/BottomNav";
import { StickyCartCTA } from "@/components/StickyCartCTA";
import { CookieBanner } from "@/components/CookieBanner";

// Routes critiques (chemin chaud client) — chargées eager pour pas
// pénaliser le 1st paint sur l'écran d'accueil et le flow de commande.
import Index from "./pages/Index.tsx";
import ProductDetail from "./pages/ProductDetail.tsx";
import Cart from "./pages/Cart.tsx";
import NotFound from "./pages/NotFound.tsx";

// Routes secondaires — lazy load. Évite ~400-500 KB sur le bundle initial.
// Le user qui arrive sur la home n'a pas besoin du JS de l'admin / Stripe /
// auth tant qu'il n'y va pas.
const Slots = lazy(() => import("./pages/Slots.tsx"));
const DriveAuPoids = lazy(() => import("./pages/DriveAuPoids.tsx"));
const LotPublic = lazy(() => import("./pages/LotPublic.tsx"));
const Checkout = lazy(() => import("./pages/Checkout.tsx"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation.tsx"));
const Login = lazy(() => import("./pages/Login.tsx"));
const Signup = lazy(() => import("./pages/Signup.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const Orders = lazy(() => import("./pages/Orders.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminSettings = lazy(() => import("./pages/AdminSettings.tsx"));
const EmployeeKanban = lazy(() => import("./pages/EmployeeKanban.tsx"));

// Module Labo (recettes BOM + productions + marges) — admin + employee
const LaboHome = lazy(() => import("./pages/labo/LaboHome.tsx"));
const LaboRecettes = lazy(() => import("./pages/labo/Recettes.tsx"));
const LaboRecetteDetail = lazy(() => import("./pages/labo/RecetteDetail.tsx"));
const LaboRecetteNouvelle = lazy(() => import("./pages/labo/RecetteNouvelle.tsx"));
const LaboProductions = lazy(() => import("./pages/labo/Productions.tsx"));
const LaboProductionDetail = lazy(() => import("./pages/labo/ProductionDetail.tsx"));
const LaboProductionNouvelle = lazy(() => import("./pages/labo/ProductionNouvelle.tsx"));
const LaboMarges = lazy(() => import("./pages/labo/Marges.tsx"));

// Module Drive Pro — public (auth obligatoire au-delà de inscription/login)
const ProInscription = lazy(() => import("./pages/pro/Inscription.tsx"));
const ProLogin = lazy(() => import("./pages/pro/Login.tsx"));
const ProCatalogue = lazy(() => import("./pages/pro/Catalogue.tsx"));
const ProPanier = lazy(() => import("./pages/pro/Panier.tsx"));
const ProCommandeDetail = lazy(() => import("./pages/pro/CommandeDetail.tsx"));
const ProFactures = lazy(() => import("./pages/pro/Factures.tsx"));
const ProCompte = lazy(() => import("./pages/pro/Compte.tsx"));

// Module Drive Pro — admin (admin + manager)
const AdminComptesPro = lazy(() => import("./pages/admin/ComptesPro.tsx"));
const AdminCommandesPro = lazy(() => import("./pages/admin/CommandesPro.tsx"));
const AdminFacturesPro = lazy(() => import("./pages/admin/FacturesPro.tsx"));

// Pages légales — chargées lazy, faible traffic, jamais sur le chemin chaud
const LegalAbout = lazy(() => import("./pages/legal/About.tsx"));
const LegalMentions = lazy(() => import("./pages/legal/Mentions.tsx"));
const LegalCGV = lazy(() => import("./pages/legal/CGV.tsx"));
const LegalConfidentialite = lazy(() => import("./pages/legal/Confidentialite.tsx"));

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
  <div className="min-h-dvh bg-[#FAFAF7] flex items-center justify-center">
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
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <OnboardingGate />
            <InstallPrompt />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
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
                <Route path="/confidentialite" element={<LegalConfidentialite />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <StickyCartCTA />
            <BottomNav />
            <CookieBanner />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
