// PROTOTYPE, throwaway. Notification toast drawn with the app's own tokens
// (popover / border / primary / muted-foreground, radius-lg), so it matches the
// rest of Cadence and follows the `.dark` class, unlike sonner's default skin.
import { X } from "lucide-react";
import type { ProtoNotification } from "./data";
import { KindIcon, NotificationText } from "./parts";

export function NotificationToast({
  n,
  onView,
  onClose,
}: {
  n: ProtoNotification;
  onView: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex w-[356px] items-start gap-3 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg">
      <KindIcon kind={n.kind} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <NotificationText n={n} />
        <div className="mt-1 truncate text-xs text-muted-foreground">{n.course}</div>
        <button
          onClick={onView}
          className="mt-3 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {n.cta ?? "View"}
        </button>
      </div>
      <button onClick={onClose} title="Dismiss" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
