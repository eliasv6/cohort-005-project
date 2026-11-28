// PROTOTYPE — throwaway, never merge (issue #17, branch prototype/knock-discussion).
// Token keeper + Knock providers + badge + Discussion toast, client only.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NavLink, useNavigate } from "react-router";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
  KnockFeedProvider,
  KnockProvider,
  useKnockFeed,
  useNotificationStore,
} from "@knocklabs/react";
import type { Feed, FeedItem } from "@knocklabs/client";
import { cn } from "~/lib/utils";

export type KnockPublicConfig = {
  publicApiKey: string;
  feedChannelId: string;
} | null;

type TokenState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signed-out"; reason: string }
  | { status: "error"; error: string; attempt: number }
  | {
      status: "ready";
      userId: string;
      token: string;
      expiresAt: number;
      fetchedAt: number;
    };

type Ctx = {
  configured: boolean;
  token: TokenState;
  renew: () => void;
  feedClient: Feed | null;
  log: string[];
  pushLog: (line: string) => void;
};

const NotificationsCtx = createContext<Ctx>({
  configured: false,
  token: { status: "unconfigured" },
  renew: () => {},
  feedClient: null,
  log: [],
  pushLog: () => {},
});
const FeedClientCtx = createContext<Feed | null>(null);

export function useNotificationsPrototype() {
  const ctx = useContext(NotificationsCtx);
  const feedClient = useContext(FeedClientCtx);
  return { ...ctx, feedClient };
}

const RENEW_LEAD_MS = 5 * 60 * 1000;
const RETRY_STEPS = [5_000, 15_000, 30_000, 60_000];

/** Simplified token keeper: fetch after hydration, renew 5 min early, retry. */
function useTokenKeeper(expectedUserId: string, pushLog: (l: string) => void) {
  const [token, setToken] = useState<TokenState>({ status: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);
  const stopped = useRef(false);

  const fetchToken = useCallback(async () => {
    if (stopped.current) return;
    clearTimeout(timer.current);
    try {
      const res = await fetch("/api/notifications/token", { cache: "no-store" });
      if (res.status === 204) {
        stopped.current = true;
        setToken({ status: "unconfigured" });
        return;
      }
      if (res.status === 401) {
        stopped.current = true;
        setToken({ status: "signed-out", reason: "401 from token endpoint" });
        pushLog("token: 401 → stopped");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        userId: string;
        token: string;
        expiresAt: number;
      };
      if (body.userId !== expectedUserId) {
        stopped.current = true;
        setToken({ status: "signed-out", reason: `token for user ${body.userId}` });
        pushLog(`token: different user ${body.userId} → stopped`);
        return;
      }
      attempt.current = 0;
      const fetchedAt = Date.now();
      setToken({ status: "ready", ...body, fetchedAt });
      pushLog(`token: ok, exp ${new Date(body.expiresAt).toLocaleTimeString()}`);
      const lifetime = body.expiresAt - fetchedAt; // ignores skew; prototype
      timer.current = setTimeout(fetchToken, Math.max(lifetime - RENEW_LEAD_MS, 1000));
    } catch (e) {
      const delay = RETRY_STEPS[Math.min(attempt.current, RETRY_STEPS.length - 1)];
      attempt.current += 1;
      setToken((prev) =>
        prev.status === "ready"
          ? prev // keep the old token until it actually fails
          : { status: "error", error: String(e), attempt: attempt.current }
      );
      pushLog(`token: ${String(e)}, retry in ${delay / 1000}s`);
      timer.current = setTimeout(fetchToken, delay);
    }
  }, [expectedUserId, pushLog]);

  useEffect(() => {
    void fetchToken();
    const online = () => void fetchToken();
    window.addEventListener("online", online);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("online", online);
    };
  }, [fetchToken]);

  return { token, renew: fetchToken };
}

export function NotificationsRoot({
  userId,
  knock,
  children,
}: {
  userId: number | null;
  knock: KnockPublicConfig;
  children: ReactNode;
}) {
  if (!userId || !knock) {
    return (
      <NotificationsCtx.Provider
        value={{
          configured: false,
          token: { status: "unconfigured" },
          renew: () => {},
          feedClient: null,
          log: [],
          pushLog: () => {},
        }}
      >
        {children}
      </NotificationsCtx.Provider>
    );
  }
  return <Configured userId={String(userId)} knock={knock}>{children}</Configured>;
}

function Configured({
  userId,
  knock,
  children,
}: {
  userId: string;
  knock: NonNullable<KnockPublicConfig>;
  children: ReactNode;
}) {
  const [log, setLog] = useState<string[]>([]);
  const pushLog = useCallback(
    (line: string) =>
      setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 40)),
    []
  );
  const { token, renew } = useTokenKeeper(userId, pushLog);
  const ready = token.status === "ready";

  return (
    <NotificationsCtx.Provider
      value={{ configured: true, token, renew, feedClient: null, log, pushLog }}
    >
      <KnockProvider
        apiKey={knock.publicApiKey}
        user={{ id: userId }}
        identificationStrategy="skip"
        userToken={ready ? token.token : undefined}
        enabled={ready}
      >
        <KnockFeedProvider feedId={knock.feedChannelId}>
          <FeedBridge ready={ready} pushLog={pushLog}>
            {children}
          </FeedBridge>
        </KnockFeedProvider>
      </KnockProvider>
    </NotificationsCtx.Provider>
  );
}

function FeedBridge({
  ready,
  pushLog,
  children,
}: {
  ready: boolean;
  pushLog: (l: string) => void;
  children: ReactNode;
}) {
  const { feedClient } = useKnockFeed();
  const navigate = useNavigate();

  // Headless: fetch ourselves once the token is there.
  useEffect(() => {
    if (!ready) return;
    void feedClient.fetch().then((r) => pushLog(`feed.fetch: ${r?.status ?? "skipped"}`));
  }, [ready, feedClient, pushLog]);

  // Discussion toasts from real-time arrivals only.
  useEffect(() => {
    const onRealtime = ({ items }: { items: FeedItem[] }) => {
      for (const item of items) {
        const cats = item.source?.categories ?? [];
        const occurred = (item.data as { occurred_at?: string } | null)?.occurred_at;
        const fresh = !occurred || Date.now() - Date.parse(occurred) < 5 * 60_000;
        pushLog(
          `realtime: ${item.source?.key} [${cats.join(",")}] fresh=${fresh}`
        );
        if (!cats.includes("discussion") || !fresh) continue;
        const url = actionUrl(item);
        toast(bodyText(item), {
          action: url
            ? {
                label: "View",
                onClick: () => {
                  // A read Notification is always seen (#17).
                  void feedClient.markAsSeen(item);
                  void feedClient.markAsRead(item);
                  navigate(url);
                },
              }
            : undefined,
        });
      }
    };
    feedClient.on("items.received.realtime", onRealtime as never);
    return () => feedClient.off("items.received.realtime", onRealtime as never);
  }, [feedClient, navigate, pushLog]);

  return <FeedClientCtx.Provider value={feedClient}>{children}</FeedClientCtx.Provider>;
}

export function bodyHtml(item: FeedItem) {
  const block = item.blocks.find((b) => b.name === "body");
  return block && "rendered" in block ? block.rendered : "";
}

export function bodyText(item: FeedItem) {
  return bodyHtml(item).replace(/<[^>]+>/g, "").trim();
}

export function actionUrl(item: FeedItem): string | null {
  const block = item.blocks.find((b) => b.name === "action_url");
  if (block && "rendered" in block && block.rendered) return block.rendered;
  return (item.data as { url?: string } | null)?.url ?? null;
}

/** Sidebar footer item. Badge = Unseen, hidden until the store has loaded. */
export function NotificationsNavItem() {
  const { configured, feedClient } = useNotificationsPrototype();
  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) =>
        cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      {configured && feedClient && <UnseenBadge feedClient={feedClient} />}
    </NavLink>
  );
}

function UnseenBadge({ feedClient }: { feedClient: Feed }) {
  const { metadata, networkStatus, items } = useNotificationStore(feedClient);
  const loaded = String(networkStatus) === "ready" || items.length > 0;
  if (!loaded || metadata.unseen_count === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
      {metadata.unseen_count}
    </span>
  );
}
