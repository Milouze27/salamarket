/**
 * Scoped loading skeleton for /v2/*. Renders a card stack matching the
 * shape of V2 grid pages (reception, sortie, transfert, etc.) so the
 * transition feels stable while server data resolves.
 *
 * Doesn't include the V2 header — V2Shell stays mounted via
 * /v2/layout.tsx and provides the sapin chrome.
 */
export default function V2Loading() {
  return (
    <div className="px-5 pt-6 pb-24 space-y-3">
      {/* Eyebrow + title skeleton */}
      <div className="space-y-2 pb-2">
        <div className="skeleton h-2.5 w-20 rounded" />
        <div className="skeleton h-6 w-3/5 rounded" />
      </div>

      {/* Card grid skeleton — 5 rows, mimics primary nav cards */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-[var(--surface-1)] rounded-2xl border border-rule p-4 h-[88px] flex items-center gap-4"
        >
          <div className="skeleton w-11 h-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/5 rounded" />
            <div className="skeleton h-2.5 w-4/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
