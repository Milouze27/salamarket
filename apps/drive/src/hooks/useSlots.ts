import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, toZonedTime } from "date-fns-tz";
import { fr } from "date-fns/locale";
import { isToday, isTomorrow } from "date-fns";

export const PARIS_TZ = "Europe/Paris";
export const MIN_LEAD_MS = 60 * 60 * 1000; // 1h

export interface Slot {
  id: string;
  slot_start: string;
  slot_end: string;
  capacity: number;
  reserved_count: number;
}

export interface DayGroup {
  dayKey: string;
  dayLabel: string;
  dayLabelSub: string;
  slots: Slot[];
}

export function isSlotSelectable(slot: Slot, now: Date): boolean {
  const start = new Date(slot.slot_start).getTime();
  const leadOk = start - now.getTime() >= MIN_LEAD_MS;
  const hasRoom = slot.reserved_count < slot.capacity;
  return leadOk && hasRoom;
}

export function slotState(
  slot: Slot,
  now: Date,
): "selectable" | "past" | "too-soon" | "full" {
  const start = new Date(slot.slot_start).getTime();
  if (start <= now.getTime()) return "past";
  if (slot.reserved_count >= slot.capacity) return "full";
  if (start - now.getTime() < MIN_LEAD_MS) return "too-soon";
  return "selectable";
}

export function groupSlotsByDay(slots: Slot[]): DayGroup[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const d = toZonedTime(new Date(s.slot_start), PARIS_TZ);
    const key = format(d, "yyyy-MM-dd", { timeZone: PARIS_TZ });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }

  const groups: DayGroup[] = [];
  for (const [dayKey, daySlots] of map.entries()) {
    daySlots.sort(
      (a, b) =>
        new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime(),
    );
    const first = toZonedTime(new Date(daySlots[0].slot_start), PARIS_TZ);
    let dayLabel: string;
    if (isToday(first)) dayLabel = "Auj.";
    else if (isTomorrow(first)) dayLabel = "Demain";
    else dayLabel = format(first, "EEE.", { timeZone: PARIS_TZ, locale: fr });
    const dayLabelSub = format(first, "d MMM", {
      timeZone: PARIS_TZ,
      locale: fr,
    });
    groups.push({ dayKey, dayLabel, dayLabelSub, slots: daySlots });
  }
  groups.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  return groups;
}

export function formatSlotRange(slot: Slot): string {
  const s = toZonedTime(new Date(slot.slot_start), PARIS_TZ);
  const e = toZonedTime(new Date(slot.slot_end), PARIS_TZ);
  const fmt = (d: Date) =>
    format(d, "HH'h'mm", { timeZone: PARIS_TZ }).replace("h00", "h00");
  return `${fmt(s)} — ${fmt(e)}`;
}

export function formatSlotDayHuman(slot: Slot): string {
  const d = toZonedTime(new Date(slot.slot_start), PARIS_TZ);
  if (isToday(d)) return "aujourd'hui";
  if (isTomorrow(d)) return "demain";
  return format(d, "EEEE d MMMM", { timeZone: PARIS_TZ, locale: fr });
}

export function formatSlotStartTime(slot: Slot): string {
  const d = toZonedTime(new Date(slot.slot_start), PARIS_TZ);
  return format(d, "HH'h'mm", { timeZone: PARIS_TZ });
}

export function useSlots() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) S'assure que la table est peuplée
      const { data: ensured, error: fnErr } = await supabase.functions.invoke(
        "ensure-slots",
        { body: {} },
      );
      if (fnErr) throw fnErr;

      if (ensured?.slots && Array.isArray(ensured.slots)) {
        setSlots(ensured.slots as Slot[]);
      } else {
        // fallback : lecture directe
        const now = new Date();
        const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const { data, error: selErr } = await supabase
          .from("pickup_slots")
          .select("*")
          .gte("slot_start", now.toISOString())
          .lt("slot_start", in7.toISOString())
          .order("slot_start", { ascending: true });
        if (selErr) throw selErr;
        setSlots((data ?? []) as Slot[]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  return { slots, loading, error, refetch: fetchSlots };
}
