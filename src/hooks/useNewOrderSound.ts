import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SOUND_URL = "/sounds/cha-ching.mp3";
const STORAGE_KEY = "sound_enabled";
const VOLUME_KEY = "sound_volume";
const DEFAULT_VOLUME = 0.7;

const readVolume = (): number => {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (!raw) return DEFAULT_VOLUME;
    const value = Number(raw);
    if (!Number.isFinite(value)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, value));
  } catch {
    return DEFAULT_VOLUME;
  }
};

interface UseNewOrderSoundOptions {
  onNewOrder?: () => void;
}

export const useNewOrderSound = ({ onNewOrder }: UseNewOrderSoundOptions = {}) => {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Charge la préférence stockée et précharge l'audio.
  useEffect(() => {
    try {
      setSoundEnabled(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // ignore
    }
    const audio = new Audio(SOUND_URL);
    audio.preload = "auto";
    audio.volume = readVolume();
    audioRef.current = audio;
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const enableSound = useCallback(() => {
    setSoundEnabled(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    // Joue un son silencieux pour débloquer l'autoplay iOS.
    const audio = audioRef.current;
    if (audio) {
      const previousVolume = audio.volume;
      audio.volume = 0;
      audio.play().catch(() => undefined).finally(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = previousVolume;
      });
    }
  }, []);

  // Subscribe Supabase Realtime aux INSERT sur orders.
  useEffect(() => {
    const channel = supabase
      .channel("admin-orders-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => {
          if (soundEnabled && audioRef.current) {
            // Relit le volume depuis localStorage à chaque play pour
            // refléter immédiatement les changements faits sur /admin/reglages.
            audioRef.current.volume = readVolume();
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => undefined);
          }
          toast.success("Nouvelle commande", {
            description: "Une commande vient d'être passée.",
          });
          onNewOrder?.();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled, onNewOrder]);

  return { soundEnabled, enableSound };
};
