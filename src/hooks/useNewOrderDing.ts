import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SOUND_URL = "/sounds/cha-ching.mp3";
const ENABLED_KEY = "employee_ding_enabled";
const VOLUME_KEY = "employee_ding_volume";
const DEFAULT_VOLUME = 0.7;
const PLAYBACK_RATE = 1.8;

const readEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw === null) return true; // default true
    return raw === "true";
  } catch {
    return true;
  }
};

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

/**
 * Joue un "ding" distinct du cha-ching admin (même fichier mais playbackRate 1.8)
 * dès qu'une commande passe en status='confirmed' (INSERT direct ou UPDATE
 * pending→confirmed). Volume + toggle persistés en localStorage, lus à chaque
 * play pour refléter immédiatement les changements de réglage.
 *
 * Note Safari iOS : audio.volume est ignoré sur iPhone (limitation OS connue).
 * Acceptable pour la démo, même fichier sound que le cha-ching admin donc pas
 * de régression spécifique.
 */
export const useNewOrderDing = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(SOUND_URL);
    audio.preload = "auto";
    audio.playbackRate = PLAYBACK_RATE;
    audio.volume = readVolume();
    audioRef.current = audio;
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const play = () => {
      if (!readEnabled()) return;
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = readVolume();
      audio.playbackRate = PLAYBACK_RATE;
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
    };

    const channel = supabase
      .channel("employee-orders-ding")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const record = payload.new as { status?: string };
          if (record?.status === "confirmed") play();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const newRow = payload.new as { status?: string };
          const oldRow = payload.old as { status?: string };
          if (oldRow?.status === "pending" && newRow?.status === "confirmed") {
            play();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
};
