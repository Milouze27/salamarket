import { useEffect, useState } from "react";
import { Share, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "install_prompt_dismissed_at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 30_000;

const isStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
};

const isIOS = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return /iPad|iPhone|iPod/.test(nav.userAgent) && !nav.standalone;
};

const wasRecentlyDismissed = (): boolean => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

const markDismissed = (): void => {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
};

export const InstallPrompt = () => {
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setPlatform("android");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    if (isIOS()) {
      setPlatform("ios");
    }

    const timer = window.setTimeout(() => {
      setOpen((prev) => {
        if (prev) return prev;
        return true;
      });
    }, SHOW_DELAY_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.clearTimeout(timer);
    };
  }, []);

  // If we hit the timer but neither flow is available, do not open the sheet.
  useEffect(() => {
    if (open && !platform) setOpen(false);
  }, [open, platform]);

  const handleClose = () => {
    markDismissed();
    setOpen(false);
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    markDismissed();
    setOpen(false);
  };

  if (!platform) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else setOpen(true);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl border-t">
        {platform === "android" ? (
          <>
            <SheetHeader className="text-left">
              <SheetTitle>Installer Salamarket</SheetTitle>
              <SheetDescription>
                Accès direct depuis votre écran d'accueil
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-3">
              <Button
                onClick={handleAndroidInstall}
                disabled={!deferredPrompt}
                className="w-full"
              >
                Installer
              </Button>
              <Button variant="ghost" onClick={handleClose} className="w-full">
                Plus tard
              </Button>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetTitle>Installer sur votre iPhone</SheetTitle>
              <SheetDescription>Pour un accès rapide en 1 tap</SheetDescription>
            </SheetHeader>
            <ol className="mt-6 flex flex-col gap-4">
              <li className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Share className="h-5 w-5" />
                </span>
                <span className="text-sm leading-relaxed">
                  Appuyez sur <span className="font-medium">Partager</span> en bas de Safari
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-sm leading-relaxed">
                  Faites défiler et choisissez <span className="font-medium">Sur l'écran d'accueil</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-5 w-5" />
                </span>
                <span className="text-sm leading-relaxed">
                  Appuyez sur <span className="font-medium">Ajouter</span> en haut à droite
                </span>
              </li>
            </ol>
            <Button onClick={handleClose} className="mt-6 w-full">
              Compris
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default InstallPrompt;
