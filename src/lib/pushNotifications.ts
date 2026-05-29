import { supabase } from "@/integrations/supabase/client";

// Clé publique VAPID — safe à hardcoder car publique par design.
// Voir RFC 8292 (Voluntary Application Server Identification).
// La clé PRIVÉE correspondante reste côté serveur dans Lovable Cloud
// → Secrets (VAPID_PRIVATE_KEY) et n'est jamais exposée au frontend.
//
// Pourquoi en dur et pas via import.meta.env.VITE_* ?
// Lovable Cloud n'a pas de section "Project Variables" frontend
// distincte des Edge Function Secrets : il n'existe qu'une seule
// liste "Secrets" (côté backend). Hardcoder est la solution
// recommandée pour les valeurs publiques par nature.
const VAPID_PUBLIC_KEY: string =
  "BENpSE5bey9U9BoCbSm6yv_NvpGtK-RiLoBcRze3AWNoKUUWwrnMmWjidZMDpTs_Tmt17rh9x8LO7AORrgxrbpE";

export const isPushSupported = (): boolean => {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
};

export const isStandalonePWA = (): boolean => {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
};

export const getNotificationPermission = (): NotificationPermission => {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
};

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
};

const getReadyRegistration = async (): Promise<ServiceWorkerRegistration> => {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
};

export const getCurrentPushSubscription =
  async (): Promise<PushSubscription | null> => {
    if (!isPushSupported()) return null;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return null;
      return await registration.pushManager.getSubscription();
    } catch {
      return null;
    }
  };

const arrayBufferToBase64 = (buffer: ArrayBuffer | null): string => {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const subscriptionKeys = (sub: PushSubscription) => ({
  endpoint: sub.endpoint,
  p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
  auth: arrayBufferToBase64(sub.getKey("auth")),
});

export const subscribePush = async (): Promise<{
  ok: boolean;
  reason?:
    | "not-supported"
    | "permission-denied"
    | "no-vapid-key"
    | "no-user"
    | "subscribe-failed"
    | "save-failed";
}> => {
  if (!isPushSupported()) return { ok: false, reason: "not-supported" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "no-vapid-key" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "permission-denied" };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-user" };

  const registration = await getReadyRegistration();

  let subscription: PushSubscription;
  try {
    const existing = await registration.pushManager.getSubscription();
    subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
  } catch (err) {
    console.error("[push] subscribe failed:", err);
    return { ok: false, reason: "subscribe-failed" };
  }

  const keys = subscriptionKeys(subscription);

  // Cast nécessaire : push_subscriptions n'est pas (encore) dans les
  // types auto-générés. Lovable régénère après exécution de la migration.
  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      upsert: (values: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<{ error: unknown }>;
    };
  })
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: keys.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) {
    console.error("[push] save subscription failed:", error);
    return { ok: false, reason: "save-failed" };
  }

  return { ok: true };
};

export const unsubscribePush = async (): Promise<{ ok: boolean }> => {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return { ok: true };

  try {
    await subscription.unsubscribe();
  } catch (err) {
    console.error("[push] unsubscribe failed:", err);
  }

  await (supabase as unknown as {
    from: (table: string) => {
      delete: () => { eq: (col: string, value: string) => Promise<unknown> };
    };
  })
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint);

  return { ok: true };
};
