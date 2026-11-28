// PROTOTYPE, throwaway. Variant E, the user's pick after the first round:
// C's placement (a "Notifications" item in the sidebar footer, by the account
// row) opening B's inbox page (role-specific categories, day groups, seen vs
// unread), with toasts for arrivals. Toast scope is toggled on the bar.
import { NavLink } from "react-router";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";
import { groupOf } from "./data";
import { CountBadge } from "./parts";
import { useNotificationsPrototype } from "./store";
import { Page } from "./variant-b";
import type { VariantMount } from "./mount";

function FooterItem() {
  const s = useNotificationsPrototype();
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!s.lastArrivalId) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 2500);
    return () => clearTimeout(t);
  }, [s.lastArrivalId]);
  if (s.audience === "none") return null;
  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) =>
        cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className={cn("size-4", pulse && "animate-bounce text-primary")} />
      <span className="flex-1">Notifications</span>
      <CountBadge count={s.unseen} />
    </NavLink>
  );
}

export const VariantE: VariantMount = {
  SidebarFooter: FooterItem,
  Page,
  toastsFor: (n, s) => s.toastScope === "all" || groupOf[n.kind] === "discussion",
};
