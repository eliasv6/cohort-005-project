// PROTOTYPE, throwaway. In-memory notification state shared by the layout
// (bell / nav / drawer) and the /notifications page. No persistence: reload resets.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { UserRole } from "~/db/schema";
import {
  type Arrival,
  type ProtoNotification,
  instructorArrivals,
  instructorFeed,
  newActivityNotification,
  studentArrivals,
  studentFeed,
} from "./data";

export type FeedState = "ready" | "empty" | "loading" | "error";
export type Audience = "student" | "instructor" | "none";

export const VARIANTS = [
  { key: "A", name: "Bell + dropdown, toasts for all" },
  { key: "B", name: "Inbox page, toasts for Discussion" },
  { key: "C", name: "Side drawer with tabs, no toasts" },
  { key: "D", name: "No bell: in context, toasts" },
  { key: "E", name: "C's footer item → B's inbox, toasts" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

export interface Store {
  variant: VariantKey;
  audience: Audience;
  items: ProtoNotification[]; // already filtered by feedState
  feedState: FeedState;
  setFeedState: (s: FeedState) => void;
  unread: number;
  unseen: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  markAllSeen: () => void;
  simulateArrival: () => ProtoNotification | undefined;
  lastArrivalId: string | null;
  toastScope: "all" | "discussion";
  setToastScope: (s: "all" | "discussion") => void;
}

const Ctx = createContext<Store | null>(null);

export function useNotificationsPrototype() {
  const s = useContext(Ctx);
  if (!s) throw new Error("NotificationsPrototypeProvider missing");
  return s;
}

const STORAGE_KEY = "notifications-prototype-variant";

export function NotificationsPrototypeProvider({
  role,
  children,
}: {
  role: UserRole | null;
  children: React.ReactNode;
}) {
  const audience: Audience =
    role === UserRole.Student ? "student" : role === UserRole.Instructor ? "instructor" : "none";

  // Variant: URL param wins; sessionStorage keeps it across in-app navigation.
  const [searchParams] = useSearchParams();
  const fromUrl = searchParams.get("variant") as VariantKey | null;
  const [stored, setStored] = useState<VariantKey | null>(null);
  useEffect(() => {
    try {
      if (fromUrl) sessionStorage.setItem(STORAGE_KEY, fromUrl);
      setStored((sessionStorage.getItem(STORAGE_KEY) as VariantKey) ?? null);
    } catch {}
  }, [fromUrl]);
  const variant: VariantKey = (VARIANTS.find((v) => v.key === (fromUrl ?? stored))?.key ?? "A") as VariantKey;

  const [all, setAll] = useState<ProtoNotification[]>([]);
  const [feedState, setFeedState] = useState<FeedState>("ready");
  const [lastArrivalId, setLastArrivalId] = useState<string | null>(null);
  const [toastScope, setToastScope] = useState<"all" | "discussion">("all");
  const cursor = useRef(0);

  useEffect(() => {
    setAll(audience === "student" ? studentFeed() : audience === "instructor" ? instructorFeed() : []);
    cursor.current = 0;
  }, [audience]);

  function simulateArrival() {
    const queue: Arrival[] = audience === "student" ? studentArrivals : audience === "instructor" ? instructorArrivals : [];
    if (!queue.length) return;
    const a = queue[cursor.current++ % queue.length];
    let arrived: ProtoNotification;
    if (a.type === "new") {
      arrived = a.make();
      setAll((xs) => [arrived, ...xs]);
    } else {
      // Course Activity collects until read: bump the open (unread) one, else start fresh.
      const open = all.find((x) => x.kind === "course-activity" && x.courseId === a.courseId && !x.read);
      if (open && open.activity) {
        arrived = {
          ...open,
          ageMinutes: 0,
          seen: false,
          activity: {
            enrollments: open.activity.enrollments + (a.delta.enrollments ?? 0),
            ratings: [...open.activity.ratings, ...(a.delta.ratings ?? [])],
            completed: open.activity.completed + (a.delta.completed ?? 0),
          },
        };
        setAll((xs) => [arrived, ...xs.filter((x) => x.id !== open.id)]);
      } else {
        arrived = newActivityNotification(a.courseId, a.course, a.delta);
        setAll((xs) => [arrived, ...xs]);
      }
    }
    setLastArrivalId(arrived.id);
    if (feedState === "empty") setFeedState("ready");
    return arrived;
  }

  const items = feedState === "ready" ? all : [];
  const store: Store = {
    variant,
    audience,
    items,
    feedState,
    setFeedState,
    unread: items.filter((x) => !x.read).length,
    unseen: items.filter((x) => !x.seen).length,
    markRead: (id) => setAll((xs) => xs.map((x) => (x.id === id ? { ...x, read: true, seen: true } : x))),
    markAllRead: () => setAll((xs) => xs.map((x) => ({ ...x, read: true, seen: true }))),
    markAllSeen: () => setAll((xs) => xs.map((x) => ({ ...x, seen: true }))),
    simulateArrival,
    lastArrivalId,
    toastScope,
    setToastScope,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
