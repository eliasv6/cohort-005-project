// PROTOTYPE, throwaway. Variant A: bell in the sidebar header, dropdown of the
// latest few, "See all" goes to a plain /notifications page. Every arrival toasts.
// Read model: badge = unread count; opening the dropdown does NOT mark read;
// clicking a row marks it read and navigates; "Mark all read" in the header.
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Popover } from "radix-ui";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";
import { Age, CountBadge, FeedPlaceholder, KindIcon, NotificationText, UnreadDot } from "./parts";
import { useNotificationsPrototype } from "./store";
import type { VariantMount } from "./mount";

function Bellbutton() {
  const s = useNotificationsPrototype();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const latest = s.items.slice(0, 6);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent" title="Notifications">
          <Bell className="size-5" />
          <CountBadge count={s.unread} className="absolute -right-1 -top-1" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" align="start" sideOffset={12} className="z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {s.unread > 0 && (
              <button onClick={s.markAllRead} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <FeedPlaceholder compact rows={3} />
          <ul className="max-h-[26rem] overflow-y-auto">
            {latest.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    s.markRead(n.id);
                    setOpen(false);
                    nav(n.href);
                  }}
                  className={cn("flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-accent", !n.read && "bg-primary/5")}
                >
                  <KindIcon kind={n.kind} className="mt-0.5" />
                  <div className="flex-1">
                    <NotificationText n={n} />
                    <div className="mt-0.5"><Age n={n} /></div>
                  </div>
                  <UnreadDot show={!n.read} />
                </button>
              </li>
            ))}
          </ul>
          {s.feedState === "ready" && s.items.length > 0 && (
            <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-accent">
              See all notifications
            </Link>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Page() {
  const s = useNotificationsPrototype();
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {s.unread > 0 && (
          <button onClick={s.markAllRead} className="text-sm text-primary hover:underline">Mark all read</button>
        )}
      </div>
      <div className="rounded-lg border">
        <FeedPlaceholder />
        {s.items.map((n) => (
          <button
            key={n.id}
            onClick={() => { s.markRead(n.id); nav(n.href); }}
            className={cn("flex w-full items-start gap-3 border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-accent", !n.read && "bg-primary/5")}
          >
            <KindIcon kind={n.kind} className="mt-0.5" />
            <div className="flex-1"><NotificationText n={n} /><div className="mt-0.5"><Age n={n} /></div></div>
            <UnreadDot show={!n.read} />
          </button>
        ))}
      </div>
    </div>
  );
}

export const VariantA: VariantMount = {
  SidebarHeader: Bellbutton,
  Page,
  toastsFor: () => true,
};
