// PROTOTYPE, throwaway. Variant C: bell lives in the sidebar footer by the
// account row; it opens a full-height drawer from the right with role-specific
// tabs. No page, no toasts: arrivals pulse the bell and show a "new" pill.
// Read model: opening the drawer clears the badge (seen); rows keep an unread dot
// until clicked, ticked off individually, or "Mark all read" on the tab.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Check, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { type Group, activitySummary, groupOf } from "./data";
import { Age, CountBadge, FeedPlaceholder, KindIcon, NotificationText, UnreadDot } from "./parts";
import { useNotificationsPrototype } from "./store";
import type { VariantMount } from "./mount";

function FooterBell() {
  const s = useNotificationsPrototype();
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!s.lastArrivalId) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 2500);
    return () => clearTimeout(t);
  }, [s.lastArrivalId]);
  if (s.audience === "none") return null;
  return (
    <>
      <button
        onClick={() => { setOpen(true); s.markAllSeen(); }}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent"
      >
        <Bell className={cn("size-4", pulse && "animate-bounce text-primary")} />
        <span className="flex-1 text-left">Notifications</span>
        <CountBadge count={s.unseen} />
      </button>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const s = useNotificationsPrototype();
  const nav = useNavigate();
  const tabs: { key: Group | "all"; label: string }[] =
    s.audience === "instructor"
      ? [{ key: "discussion", label: "Questions & Replies" }, { key: "activity", label: "Course Activity" }]
      : [{ key: "all", label: "All" }, { key: "discussion", label: "Discussion" }, { key: "progress", label: "Your progress" }];
  const [tab, setTab] = useState(tabs[0].key);
  const shown = s.items.filter((n) => tab === "all" || groupOf[n.kind] === tab || (tab === "progress" && groupOf[n.kind] === "course"));
  const newCount = shown.filter((n) => n.ageMinutes === 0 && !n.read).length;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div className="flex h-full w-[26rem] flex-col border-l bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="flex gap-1 border-b px-3">
          {tabs.map((t) => {
            const c = s.items.filter((n) => !n.read && (t.key === "all" || groupOf[n.kind] === t.key || (t.key === "progress" && groupOf[n.kind] === "course"))).length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground")}>
                {t.label} {c > 0 && <span className="ml-1 text-xs text-primary">{c}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-5 py-2 text-xs">
          {newCount > 0 ? <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">{newCount} new</span> : <span />}
          {shown.some((n) => !n.read) && (
            <button onClick={s.markAllRead} className="text-primary hover:underline">Mark all read</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <FeedPlaceholder rows={6} />
          {tab === "activity"
            ? shown.map((n) => (
                <div key={n.id} className={cn("mx-4 mb-3 rounded-lg border p-4", !n.read && "border-primary/50 bg-primary/5")}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{n.course}</span>
                    <Age n={n} />
                  </div>
                  {n.activity && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <Stat label="Enrollments" value={n.activity.enrollments} />
                      <Stat label="Ratings" value={n.activity.ratings.length} sub={n.activity.ratings.map((r) => `★${r}`).join(" ")} />
                      <Stat label="Completed" value={n.activity.completed} />
                    </div>
                  )}
                  <div className="mt-3 flex justify-between text-xs">
                    <span className="text-muted-foreground">{n.read ? "Closed" : "Collecting until read"}</span>
                    <button onClick={() => { s.markRead(n.id); onClose(); nav(n.href); }} className="text-primary hover:underline">See Students →</button>
                  </div>
                  <span className="sr-only">{n.activity && activitySummary(n.activity)}</span>
                </div>
              ))
            : shown.map((n) => (
                <div key={n.id} className="group flex items-start gap-3 px-5 py-3 text-sm hover:bg-accent">
                  <KindIcon kind={n.kind} className="mt-0.5" />
                  <button onClick={() => { s.markRead(n.id); onClose(); nav(n.href); }} className="flex-1 text-left">
                    <NotificationText n={n} />
                    <div className="mt-0.5 flex items-center gap-2"><Age n={n} /><span className="text-xs text-muted-foreground">· {n.course}</span></div>
                  </button>
                  {!n.read ? (
                    <button title="Mark read" onClick={() => s.markRead(n.id)} className="mt-0.5 rounded p-0.5 opacity-0 hover:bg-background group-hover:opacity-100">
                      <Check className="size-3.5" />
                    </button>
                  ) : null}
                  <UnreadDot show={!n.read} />
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-md bg-muted/50 py-2">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export const VariantC: VariantMount = {
  SidebarFooter: FooterBell,
  toastsFor: () => false,
};
