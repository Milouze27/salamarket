import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BRAND } from "@/config/brand";
import {
  formatSlotDayHuman,
  formatSlotRange,
  formatSlotStartTime,
  groupSlotsByDay,
  isSlotSelectable,
  slotState,
  useSlots,
  type Slot,
} from "@/hooks/useSlots";
import { useCheckoutStore } from "@/stores/checkoutStore";
import { cn } from "@/lib/utils";

const SlotCardSkeleton = () => (
  <div className="h-20 rounded-2xl bg-white border border-border animate-pulse" />
);

const Slots = () => {
  const navigate = useNavigate();
  const { slots, loading, error, refetch } = useSlots();
  const selectedSlotId = useCheckoutStore((s) => s.selectedSlotId);
  const setSlot = useCheckoutStore((s) => s.setSlot);
  const clearSlot = useCheckoutStore((s) => s.clearSlot);

  // Tick toutes les 60s pour réévaluer isSlotSelectable
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);

  const groups = useMemo(() => groupSlotsByDay(slots), [slots]);

  const [activeDayKey, setActiveDayKey] = useState<string | null>(null);

  // Sélection par défaut + reset si le jour actif n'existe plus après
  // un refetch des slots (sinon activeGroup devient null silencieusement
  // et l'affichage casse).
  useEffect(() => {
    if (groups.length === 0) {
      if (activeDayKey !== null) setActiveDayKey(null);
      return;
    }
    const dayStillExists =
      activeDayKey && groups.some((g) => g.dayKey === activeDayKey);
    if (dayStillExists) return;

    const firstWithSelectable = groups.find((g) =>
      g.slots.some((s) => isSlotSelectable(s, now)),
    );
    setActiveDayKey((firstWithSelectable ?? groups[0]).dayKey);
  }, [groups, activeDayKey, now]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.dayKey === activeDayKey) ?? null,
    [groups, activeDayKey],
  );

  const selectedSlot: Slot | null = useMemo(() => {
    if (!selectedSlotId) return null;
    return slots.find((s) => s.id === selectedSlotId) ?? null;
  }, [selectedSlotId, slots]);

  const handleContinue = () => {
    if (!selectedSlot) return;
    navigate("/paiement");
  };

  return (
    <div className="min-h-dvh bg-bg text-text flex flex-col">
      <AppHeader showBack title="Choisir mon créneau" />

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 pt-4 pb-36 flex flex-col gap-3">
        <p className="text-sm text-muted">
          Retrait à {BRAND.store.name}
        </p>

        {/* Tabs jours */}
        {loading ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-16 w-20 rounded-2xl bg-white border border-border animate-pulse shrink-0"
              />
            ))}
          </div>
        ) : groups.length > 0 ? (
          <div
            className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sticky top-14 z-30 bg-bg/95 backdrop-blur"
            style={{
              scrollSnapType: "x mandatory",
              scrollbarWidth: "none",
            }}
          >
            <style>{`.tabs-scroll::-webkit-scrollbar{display:none}`}</style>
            {groups.map((g) => {
              const active = g.dayKey === activeDayKey;
              const hasAny = g.slots.some((s) => isSlotSelectable(s, now));
              return (
                <button
                  key={g.dayKey}
                  onClick={() => setActiveDayKey(g.dayKey)}
                  className={cn(
                    "shrink-0 h-16 min-w-[5rem] px-3 rounded-2xl border flex flex-col items-center justify-center transition-colors",
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-bg border-border text-text",
                    !hasAny && !active && "opacity-50",
                  )}
                  style={{ scrollSnapAlign: "start" }}
                >
                  <span className="text-sm font-bold leading-tight">
                    {g.dayLabel}
                  </span>
                  <span className="text-[11px] opacity-80 leading-tight mt-0.5">
                    {g.dayLabelSub}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Grille des créneaux */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SlotCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center text-center py-16 gap-3">
            <p className="text-sm text-muted">
              Impossible de charger les créneaux.
            </p>
            <button
              onClick={refetch}
              className="px-5 py-2.5 rounded-full bg-primary text-white text-sm font-semibold"
            >
              Réessayer
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 gap-3">
            <p className="text-sm text-muted">
              Aucun créneau disponible pour le moment.
            </p>
            <button
              onClick={refetch}
              className="px-5 py-2.5 rounded-full bg-primary text-white text-sm font-semibold"
            >
              Réessayer
            </button>
          </div>
        ) : activeGroup ? (
          activeGroup.slots.some((s) => isSlotSelectable(s, now)) ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {activeGroup.slots.map((slot) => {
                const state = slotState(slot, now);
                const selectable = state === "selectable";
                const isSelected = selectedSlotId === slot.id;
                const remaining = Math.max(
                  0,
                  slot.capacity - slot.reserved_count,
                );
                let sub = `${remaining} place${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}`;
                if (state === "past") sub = "Passé";
                else if (state === "too-soon") sub = "Trop proche";
                else if (state === "full") sub = "Complet";

                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!selectable}
                    onClick={() => {
                      // Toggle off si on re-clique sur le slot déjà
                      // sélectionné — pattern UX usuel (90% des UI).
                      if (isSelected) {
                        clearSlot();
                      } else {
                        setSlot(slot.id);
                      }
                    }}
                    className={cn(
                      "rounded-2xl border p-3 flex flex-col items-center justify-center text-center transition-all",
                      selectable
                        ? isSelected
                          ? "bg-[#0E3B2E] border-[#0E3B2E] text-white active:scale-[0.98]"
                          : "bg-white border-[#0E3B2E]/15 text-[#0E3B2E] active:scale-[0.98] hover:border-[#0E3B2E]/30"
                        : "bg-[#FAF7EE] border-[#0E3B2E]/10 text-[#0F1A14]/40 opacity-60 pointer-events-none",
                    )}
                  >
                    <span className="text-base font-bold leading-tight">
                      {formatSlotRange(slot)}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] mt-1",
                        isSelected ? "text-white/85" : "text-[#0F1A14]/55",
                      )}
                    >
                      {sub}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-muted">
              Aucun créneau disponible ce jour. Choisissez un autre jour.
            </div>
          )
        ) : null}
      </main>

      {selectedSlot && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-bg/95 backdrop-blur border-t border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex flex-col gap-2">
            <p className="text-sm text-text text-center">
              Retrait {formatSlotDayHuman(selectedSlot)} à{" "}
              <span className="font-semibold">
                {formatSlotStartTime(selectedSlot)}
              </span>
            </p>
            <button
              onClick={handleContinue}
              className="group w-full h-14 rounded-2xl bg-gradient-to-r from-[#0E3B2E] to-[#082A20] text-white font-bold text-base shadow-lg shadow-[#0E3B2E]/30 hover:shadow-xl hover:shadow-[#0E3B2E]/40 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <span>Continuer</span>
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Slots;
