/**
 * Root loading skeleton (Next 14 App Router). Streams instantly while
 * a server segment resolves. Mirrors V2Shell layout (header sapin +
 * card grid) so the transition feels stable on mobile.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="min-h-screen bg-cream">
      <span className="sr-only">Chargement…</span>
      <div className="mx-auto w-full max-w-[460px] min-h-screen relative bg-cream">
        {/* Header skeleton — gradient sapin identique au shell */}
        <header className="bg-gradient-to-b from-[#0E3B2E] to-[#082A20] safe-top">
          <div className="flex items-center gap-2 px-4 pt-3 pb-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 animate-pulse" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-3 w-20 rounded bg-white/15 animate-pulse" />
              <div className="h-2 w-16 rounded bg-[#C9A227]/30 animate-pulse" />
            </div>
            <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
            <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
          </div>
        </header>

        {/* Card grid skeleton */}
        <main className="px-5 pt-6 pb-24 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-rule p-4 h-[88px] flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl bg-line-light animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/5 rounded bg-line-light animate-pulse" />
                <div className="h-2.5 w-4/5 rounded bg-line-light/60 animate-pulse" />
              </div>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
