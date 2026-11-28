// PROTOTYPE, throwaway. "Prototype: where notifications surface in the app"
// (wayfinder ticket eliasv6/cohort-005-project#6).
//
// Four structurally different variants mounted in the real app layout, switchable
// via `?variant=A|B|C|D` and the floating bar (← / → keys). Switch Student vs
// Instructor in the DevUI panel. Fake, in-memory data; nothing is persisted.
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PrototypeSwitcher } from "~/components/prototype-switcher";
import type { VariantMount } from "./mount";
import { NotificationToast } from "./toast";
import { type FeedState, type VariantKey, VARIANTS, useNotificationsPrototype } from "./store";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import { VariantD } from "./variant-d";
import { VariantE } from "./variant-e";

export { NotificationsPrototypeProvider, useNotificationsPrototype } from "./store";

const TOASTS: Record<Exclude<VariantKey, "E">, string> = { A: "all", B: "discussion only", C: "none", D: "all" };
const MOUNTS: Record<VariantKey, VariantMount> = { A: VariantA, B: VariantB, C: VariantC, D: VariantD, E: VariantE };

export function useVariantMount() {
  return MOUNTS[useNotificationsPrototype().variant];
}

export function NotificationsPrototypeBar() {
  const s = useNotificationsPrototype();
  const mount = useVariantMount();
  const nav = useNavigate();

  function arrive() {
    const n = s.simulateArrival();
    if (!n) return;
    if (mount.toastsFor(n, s)) {
      toast.custom((id) => (
        <NotificationToast
          n={n}
          onView={() => { s.markRead(n.id); toast.dismiss(id); nav(n.href); }}
          onClose={() => toast.dismiss(id)}
        />
      ));
    }
  }

  const states: FeedState[] = ["ready", "empty", "loading", "error"];
  return (
    <PrototypeSwitcher variants={VARIANTS} current={s.variant}>
      <div className="flex items-center gap-2 text-[11px]">
        <button onClick={arrive} disabled={s.audience === "none"} className="rounded-full bg-white/15 px-2 py-0.5 hover:bg-white/25 disabled:opacity-40">
          + Simulate arrival
        </button>
        <span className="text-white/50">feed:</span>
        {states.map((st) => (
          <button
            key={st}
            onClick={() => s.setFeedState(st)}
            className={s.feedState === st ? "rounded-full bg-fuchsia-500 px-2 py-0.5" : "rounded-full px-2 py-0.5 text-white/70 hover:bg-white/15"}
          >
            {st}
          </button>
        ))}
        {s.variant === "E" && (
          <>
            <span className="ml-2 text-white/50">toast:</span>
            {(["all", "discussion"] as const).map((t) => (
              <button
                key={t}
                onClick={() => s.setToastScope(t)}
                className={s.toastScope === t ? "rounded-full bg-fuchsia-500 px-2 py-0.5" : "rounded-full px-2 py-0.5 text-white/70 hover:bg-white/15"}
              >
                {t === "all" ? "every type" : "Discussion only"}
              </button>
            ))}
          </>
        )}
      </div>
      <div className="font-mono text-[10px] text-white/60">
        audience={s.audience} · items={s.items.length} · unread={s.unread} · unseen={s.unseen} · toasts={s.variant === "E" ? s.toastScope : TOASTS[s.variant]}
      </div>
    </PrototypeSwitcher>
  );
}
