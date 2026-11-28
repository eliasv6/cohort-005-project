// PROTOTYPE, throwaway. Variant D: no bell, no inbox. Notifications live where the
// work is: a "For you" strip at the top of the Student dashboard / Instructor
// "My Courses", count badges on the existing nav items, and toasts for every
// arrival (the only real-time surface). Dismissing a card (×) = read.
import { useLocation, useNavigate } from "react-router";
import { X } from "lucide-react";
import { cn } from "~/lib/utils";
import { groupOf } from "./data";
import { Age, FeedPlaceholder, KindIcon, NotificationText } from "./parts";
import { useNotificationsPrototype } from "./store";
import type { VariantMount } from "./mount";

function ForYou() {
  const s = useNotificationsPrototype();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const home = s.audience === "student" ? "/dashboard" : s.audience === "instructor" ? "/instructor" : null;
  if (pathname !== home) return null;

  const unread = s.items.filter((n) => !n.read);
  const cards = unread.filter((n) => groupOf[n.kind] !== "discussion");
  const talk = unread.filter((n) => groupOf[n.kind] === "discussion");

  return (
    <section className="border-b bg-muted/30 px-8 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">For you</h2>
        {unread.length > 0 && <button onClick={s.markAllRead} className="text-xs text-primary hover:underline">Dismiss all</button>}
      </div>
      <FeedPlaceholder compact rows={2} />
      <div className="flex gap-4 overflow-x-auto pb-1">
        {talk.length > 0 && (
          <div className="w-80 shrink-0 rounded-lg border bg-background p-4">
            <div className="mb-2 text-sm font-semibold">
              {s.audience === "instructor" ? `${talk.length} waiting in Questions` : `${talk.length} new in your threads`}
            </div>
            <ul className="space-y-2">
              {talk.slice(0, 3).map((n) => (
                <li key={n.id} className="flex items-start gap-2 text-sm">
                  <KindIcon kind={n.kind} className="mt-0.5" />
                  <button className="flex-1 text-left hover:underline" onClick={() => { s.markRead(n.id); nav(n.href); }}>
                    <NotificationText n={n} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cards.map((n) => (
          <div key={n.id} className={cn("relative flex w-72 shrink-0 flex-col rounded-lg border bg-background p-4")}>
            <button onClick={() => s.markRead(n.id)} className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-accent" title="Dismiss">
              <X className="size-3.5" />
            </button>
            <KindIcon kind={n.kind} className="size-5" />
            <div className="mt-2 flex-1 pr-4 text-sm"><NotificationText n={n} /></div>
            <div className="mt-3 flex items-center justify-between">
              <Age n={n} />
              {n.cta && (
                <button onClick={() => { s.markRead(n.id); nav(n.href); }} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  {n.cta}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const VariantD: VariantMount = {
  AboveOutlet: ForYou,
  navBadges: (s): Record<string, number> => {
    const unread = s.items.filter((n) => !n.read);
    if (s.audience === "student") return { "/dashboard": unread.length };
    if (s.audience === "instructor")
      return {
        "/instructor/questions": unread.filter((n) => n.kind === "new-question" || n.kind === "instructor-reply").length,
        "/instructor": unread.filter((n) => n.kind === "course-activity").length,
      };
    return {};
  },
  toastsFor: () => true,
};
