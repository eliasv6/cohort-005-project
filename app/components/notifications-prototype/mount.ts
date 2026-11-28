// PROTOTYPE, throwaway. The slots a variant can fill in the app layout.
import type { ProtoNotification } from "./data";
import type { Store } from "./store";

export interface VariantMount {
  SidebarHeader?: () => React.ReactNode; // next to the "Cadence" wordmark
  SidebarNav?: () => React.ReactNode; // first item in the nav list
  SidebarFooter?: () => React.ReactNode; // above the account row
  AboveOutlet?: () => React.ReactNode; // top of the main content area
  navBadges?: (s: Store) => Record<string, number>; // badge counts keyed by nav `to`
  Page?: () => React.ReactNode; // what /notifications renders; absent = "no page"
  toastsFor: (n: ProtoNotification) => boolean;
}
