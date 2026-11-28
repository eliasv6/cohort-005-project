// PROTOTYPE, throwaway. Small shared pieces: text, icon, feed-state placeholders.
// Layouts are NOT shared; each variant owns its own.
import { AtSign, BarChart3, BookOpen, CircleCheck, Flag, MessageCircle, Receipt, Sparkles, Trophy } from "lucide-react";
import { cn } from "~/lib/utils";
import { type Kind, type ProtoNotification, activitySummary, formatAge } from "./data";
import { type Audience, type FeedState, useNotificationsPrototype } from "./store";

export function KindIcon({ kind, className }: { kind: Kind; className?: string }) {
  const c = cn("size-4 shrink-0", className);
  switch (kind) {
    case "answered": return <CircleCheck className={cn(c, "text-emerald-600")} />;
    case "reply":
    case "instructor-reply": return <MessageCircle className={cn(c, "text-sky-600")} />;
    case "new-question": return <AtSign className={cn(c, "text-violet-600")} />;
    case "refund": return <Receipt className={cn(c, "text-amber-600")} />;
    case "new-material": return <Sparkles className={cn(c, "text-pink-600")} />;
    case "not-started":
    case "inactive": return <BookOpen className={cn(c, "text-orange-600")} />;
    case "milestone": return <Flag className={cn(c, "text-primary")} />;
    case "completed": return <Trophy className={cn(c, "text-yellow-600")} />;
    case "course-activity": return <BarChart3 className={cn(c, "text-teal-600")} />;
  }
}

export function NotificationText({ n }: { n: ProtoNotification }) {
  if (n.kind === "course-activity" && n.activity) {
    return (
      <span>
        <em className="not-italic font-semibold">{n.target}</em>: {activitySummary(n.activity)}
        {!n.read && <span className="ml-1 text-xs text-muted-foreground">(collecting until read)</span>}
      </span>
    );
  }
  return (
    <span>
      {n.actor && <strong className="font-semibold">{n.actor} </strong>}
      {n.verb} <em className="not-italic font-semibold">{n.target}</em>
    </span>
  );
}

export function plainText(n: ProtoNotification) {
  if (n.kind === "course-activity" && n.activity) return `${n.target}: ${activitySummary(n.activity)}`;
  return `${n.actor ? n.actor + " " : ""}${n.verb} ${n.target}`;
}

export function Age({ n }: { n: ProtoNotification }) {
  return <span className="text-xs text-muted-foreground">{formatAge(n.ageMinutes)}</span>;
}

export function UnreadDot({ show }: { show: boolean }) {
  return <span className={cn("size-2 shrink-0 rounded-full", show ? "bg-primary" : "bg-transparent")} />;
}

export function emptyCopy(a: Audience) {
  if (a === "student") return "Answers, Replies and course reminders will show up here.";
  if (a === "instructor") return "New Questions on your lessons and Course Activity will show up here.";
  return "Admins get no Notifications in this effort (out of scope).";
}

/** Renders the non-ready states; returns null when the feed is ready with items. */
export function FeedPlaceholder({ rows = 4, compact = false }: { rows?: number; compact?: boolean }) {
  const { feedState, setFeedState, items, audience } = useNotificationsPrototype();
  const state: FeedState = feedState === "ready" && items.length === 0 ? "empty" : feedState;
  if (state === "ready") return null;
  if (state === "loading")
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="size-4 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  if (state === "error")
    return (
      <div className={cn("p-6 text-center text-sm", compact && "p-4")}>
        <p className="font-medium">Couldn't load notifications.</p>
        <p className="mt-1 text-muted-foreground">The rest of Cadence still works.</p>
        <button onClick={() => setFeedState("ready")} className="mt-3 rounded-md border px-3 py-1 text-xs hover:bg-accent">
          Retry
        </button>
      </div>
    );
  return (
    <div className={cn("p-6 text-center text-sm", compact && "p-4")}>
      <p className="font-medium">You're all caught up</p>
      <p className="mt-1 text-muted-foreground">{emptyCopy(audience)}</p>
    </div>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cn("inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-5 text-white", className)}>
      {count > 9 ? "9+" : count}
    </span>
  );
}
