// PROTOTYPE, throwaway. Variant B: no dropdown. A "Notifications" nav item with a
// count, and a full inbox page with filters and day groups. Only Discussion
// arrivals toast; Progress / Course Activity / Refunds arrive silently.
// Read model: two states. The badge counts UNSEEN and clears when you open the
// page; rows stay bold (UNREAD) until clicked or "Mark all read".
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { Inbox } from "lucide-react";
import { cn } from "~/lib/utils";
import { type Group, dayBucket, groupOf } from "./data";
import { Age, CountBadge, FeedPlaceholder, KindIcon, NotificationText, UnreadDot } from "./parts";
import { useNotificationsPrototype } from "./store";
import type { VariantMount } from "./mount";

function NavItem() {
  const s = useNotificationsPrototype();
  if (s.audience === "none") return null;
  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Inbox className="size-4" />
      <span className="flex-1">Notifications</span>
      <CountBadge count={s.unseen} />
    </NavLink>
  );
}

type Filter = "all" | "unread" | Group;

export function Page() {
  const s = useNotificationsPrototype();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");

  // Opening the inbox clears the badge (seen), not the bold rows (read).
  useEffect(() => {
    const t = setTimeout(s.markAllSeen, 600);
    return () => clearTimeout(t);
  }, [s.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters: { key: Filter; label: string }[] =
    s.audience === "instructor"
      ? [
          { key: "all", label: "All" },
          { key: "unread", label: "Unread" },
          { key: "discussion", label: "Questions & Replies" },
          { key: "activity", label: "Course Activity" },
        ]
      : [
          { key: "all", label: "All" },
          { key: "unread", label: "Unread" },
          { key: "discussion", label: "Discussion" },
          { key: "progress", label: "Your progress" },
          { key: "course", label: "Courses & Refunds" },
        ];

  const shown = s.items.filter((n) => (filter === "all" ? true : filter === "unread" ? !n.read : groupOf[n.kind] === filter));
  const buckets = ["Today", "Yesterday", "Earlier"].map((b) => ({ b, xs: shown.filter((n) => dayBucket(n.ageMinutes) === b) }));

  return (
    <div className="mx-auto flex max-w-5xl gap-8 p-8">
      <aside className="w-48 shrink-0">
        <h1 className="mb-4 text-2xl font-bold">Inbox</h1>
        <div className="space-y-1">
          {filters.map((f) => {
            const count = s.items.filter((n) => !n.read && (f.key === "all" || f.key === "unread" || groupOf[n.kind] === f.key)).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn("flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm", filter === f.key ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent")}
              >
                {f.label}
                {count > 0 && f.key !== "unread" && <span className="text-xs">{count}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Badge in the sidebar clears when you open this page. Bold rows stay unread until clicked.
        </p>
      </aside>
      <section className="flex-1">
        <div className="mb-3 flex justify-end">
          {s.unread > 0 && <button onClick={s.markAllRead} className="text-sm text-primary hover:underline">Mark all read</button>}
        </div>
        <div className="rounded-lg border">
          <FeedPlaceholder rows={6} />
          {s.feedState === "ready" && s.items.length > 0 && shown.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing here.</p>
          )}
          {buckets.filter((x) => x.xs.length).map(({ b, xs }) => (
            <div key={b}>
              <div className="border-b bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{b}</div>
              {xs.map((n) => (
                <div key={n.id} className={cn("group flex items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0", !n.read ? "font-medium" : "text-muted-foreground")}>
                  <UnreadDot show={!n.read} />
                  <KindIcon kind={n.kind} />
                  <button onClick={() => { s.markRead(n.id); nav(n.href); }} className="flex-1 text-left hover:underline">
                    <NotificationText n={n} />
                  </button>
                  <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground md:inline">{n.course}</span>
                  <Age n={n} />
                  {!n.read && (
                    <button onClick={() => s.markRead(n.id)} className="invisible text-xs text-primary group-hover:visible">Mark read</button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export const VariantB: VariantMount = {
  SidebarNav: NavItem,
  Page,
  toastsFor: (n) => groupOf[n.kind] === "discussion",
};
