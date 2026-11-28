// PROTOTYPE, throwaway. Floating bottom-centre bar that cycles `?variant=`.
// Hidden in production builds.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
  children,
}: {
  variants: readonly { key: string; name: string }[];
  current: string;
  children?: React.ReactNode; // extra prototype-only controls / state readout
}) {
  const [, setSearchParams] = useSearchParams();
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));

  function go(delta: number) {
    const next = variants[(idx + delta + variants.length) % variants.length];
    setSearchParams(
      (p) => {
        p.set("variant", next.key);
        return p;
      },
      { replace: true, preventScrollReset: true }
    );
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;
  const v = variants[idx];

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-2xl bg-zinc-900 px-3 py-2 text-xs text-white shadow-2xl ring-2 ring-fuchsia-500">
      <div className="flex items-center gap-2">
        <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/15" title="Previous variant (←)">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-64 text-center font-medium">
          <span className="mr-1 rounded bg-fuchsia-500 px-1.5 py-0.5 font-bold">{v.key}</span>
          {v.name}
        </span>
        <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/15" title="Next variant (→)">
          <ChevronRight className="size-4" />
        </button>
      </div>
      {children}
    </div>
  );
}
