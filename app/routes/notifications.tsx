// PROTOTYPE — throwaway, never merge (issue #17). The Inbox, client-rendered,
// with a state panel that surfaces the token, feed, outbox and bulk operations.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useNotificationStore } from "@knocklabs/react";
import type { Feed, FeedItem } from "@knocklabs/client";
import {
  actionUrl,
  bodyHtml,
  useNotificationsPrototype,
} from "~/components/notifications.prototype";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Notifications (prototype) — Cadence" }];
}

type Tab = "all" | "unread" | "discussion";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "discussion", label: "Discussion" },
];

function ceilToSecond(iso: string) {
  const ms = Date.parse(iso);
  return new Date(Math.floor(ms / 1000) * 1000 + 1000).toISOString();
}

function inTab(item: FeedItem, tab: Tab) {
  if (tab === "unread") return !item.read_at;
  if (tab === "discussion") return item.source.categories.includes("discussion");
  return true;
}

export default function NotificationsPage() {
  const { configured, token, feedClient } = useNotificationsPrototype();
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-bold">Notifications</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        PROTOTYPE (issue #17): throwaway, Knock development environment.
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          {!configured && <p>Notifications aren't configured in this environment.</p>}
          {configured && token.status === "signed-out" && <p>Signed out.</p>}
          {configured && feedClient && <Inbox feedClient={feedClient} />}
        </div>
        <StatePanel />
      </div>
    </div>
  );
}

function Inbox({ feedClient }: { feedClient: Feed }) {
  const { items, metadata, networkStatus } = useNotificationStore(feedClient);
  const { pushLog } = useNotificationsPrototype();
  const [tab, setTab] = useState<Tab>("all");
  const navigate = useNavigate();
  const seenOnce = useRef(false);

  // Opening the Inbox clears the badge (Unseen), not Unread.
  useEffect(() => {
    if (seenOnce.current || String(networkStatus) !== "ready") return;
    seenOnce.current = true;
    if (metadata.unseen_count > 0) {
      void feedClient.markAllAsSeen().then(() => pushLog("markAllAsSeen sent"));
    }
  }, [networkStatus, metadata.unseen_count, feedClient, pushLog]);

  // A read Notification is always seen: arrivals while the Inbox is open are
  // marked seen, so the badge never counts something on screen (#17).
  useEffect(() => {
    const onRealtime = ({ items }: { items: FeedItem[] }) =>
      void feedClient.markAsSeen(items);
    feedClient.on("items.received.realtime", onRealtime as never);
    return () => feedClient.off("items.received.realtime", onRealtime as never);
  }, [feedClient]);

  const shown = items.filter((i) => inTab(i, tab));
  const tabUnread = shown.filter((i) => !i.read_at);

  async function markAllRead() {
    const newest = shown[0]; // feed is newest first
    if (!newest) return;
    const ids = tabUnread.map((i) => i.id);
    const store = feedClient.store.getState();
    const prevMeta = store.metadata;
    const now = new Date().toISOString();
    store.setItemAttrs(ids, { read_at: now });
    store.setMetadata({
      ...prevMeta,
      unread_count: Math.max(0, prevMeta.unread_count - ids.length),
    });
    const res = await fetch("/api/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Knock's older_than is exclusive and compares whole seconds, so round
      // the newest loaded item's inserted_at up to the next second (#17).
      body: JSON.stringify({ tab, before: ceilToSecond(newest.inserted_at) }),
    });
    const body = await res.json().catch(() => null);
    pushLog(
      `read-all ${tab} before=${newest.inserted_at} → ${res.status} ${JSON.stringify(body)}`
    );
    if (!res.ok) {
      feedClient.store.getState().setItemAttrs(ids, { read_at: null });
      feedClient.store.getState().setMetadata(prevMeta);
      const { toast } = await import("sonner");
      toast.error("Couldn't mark these read. Try again.");
    } else if (body?.json?.id) {
      window.dispatchEvent(
        new CustomEvent("prototype-bulk-op", { detail: body.json.id as string })
      );
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
        {tabUnread.length > 0 && (
          <button
            onClick={() => void markAllRead()}
            className="ml-auto rounded-md border px-3 py-1 text-sm"
          >
            Mark all read
          </button>
        )}
      </div>
      {String(networkStatus) === "loading" && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {String(networkStatus) === "error" && (
        <p className="text-sm">
          Couldn't load your Notifications.{" "}
          <button className="underline" onClick={() => void feedClient.fetch()}>
            Retry
          </button>
        </p>
      )}
      {String(networkStatus) === "ready" && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      )}
      <ul className="divide-y rounded-md border">
        {shown.map((item) => {
          const occurred =
            (item.data as { occurred_at?: string } | null)?.occurred_at ??
            item.inserted_at;
          return (
            <li key={item.id}>
              <button
                onClick={() => {
                  void feedClient.markAsRead(item);
                  const url = actionUrl(item);
                  if (url) navigate(url);
                }}
                className={cn(
                  "flex w-full items-start gap-3 p-3 text-left hover:bg-muted",
                  !item.read_at && "font-semibold"
                )}
              >
                {!item.read_at && (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm [&_p]:m-0"
                    dangerouslySetInnerHTML={{ __html: bodyHtml(item) }}
                  />
                  <div className="text-xs font-normal text-muted-foreground">
                    {new Date(occurred).toLocaleString()} · {item.source.key} ·{" "}
                    {item.seen_at ? "seen" : "unseen"} ·{" "}
                    {item.read_at ? "read" : "unread"}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type OutboxRow = {
  id: number;
  operation: string;
  workflow: string | null;
  payload: string;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  attempts: number;
  last_status: number | null;
  last_response: string | null;
  bulk_operation_id: string | null;
};

function StatePanel() {
  const { token, renew, feedClient, log } = useNotificationsPrototype();
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [bulkOps, setBulkOps] = useState<Record<string, unknown>>({});
  const [lastBulkId, setLastBulkId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/notifications/prototype");
      const body = (await res.json()) as { outbox: OutboxRow[] };
      if (alive) setOutbox(body.outbox);
    };
    void tick();
    const t = setInterval(tick, 2000);
    const onBulk = (e: Event) => setLastBulkId((e as CustomEvent<string>).detail);
    window.addEventListener("prototype-bulk-op", onBulk);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("prototype-bulk-op", onBulk);
    };
  }, []);

  async function checkBulk(id: string) {
    const res = await fetch("/api/notifications/prototype", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: id }),
    });
    const body = await res.json();
    setBulkOps((b) => ({ ...b, [id]: body.json }));
  }

  async function resend(id: number) {
    await fetch("/api/notifications/prototype", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resend: id }),
    });
  }

  const bulkIds = [
    ...(lastBulkId ? [lastBulkId] : []),
    ...outbox.map((r) => r.bulk_operation_id).filter((x): x is string => !!x),
  ];

  return (
    <aside className="space-y-4 rounded-md border bg-muted/30 p-3 text-xs">
      <section>
        <h2 className="mb-1 font-semibold">Token</h2>
        <pre className="whitespace-pre-wrap">
          {token.status === "ready"
            ? `ready · user ${token.userId} · exp ${new Date(token.expiresAt).toLocaleTimeString()}`
            : JSON.stringify(token)}
        </pre>
        <button className="underline" onClick={renew}>
          Renew now
        </button>
      </section>
      {feedClient && <FeedState feedClient={feedClient} />}
      <section>
        <h2 className="mb-1 font-semibold">Bulk operations</h2>
        {bulkIds.length === 0 && <p>none yet</p>}
        {[...new Set(bulkIds)].map((id) => (
          <div key={id} className="mb-1">
            <button className="underline" onClick={() => void checkBulk(id)}>
              check {id.slice(0, 8)}
            </button>
            {bulkOps[id] != null && (
              <pre className="whitespace-pre-wrap">
                {(() => {
                  const b = bulkOps[id] as Record<string, unknown>;
                  return `${b.name} · ${b.status} · success ${b.success_count} · errors ${b.error_count} · est ${b.estimated_total_rows}`;
                })()}
              </pre>
            )}
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-1 font-semibold">Outbox (latest 30)</h2>
        {outbox.map((r) => (
          <details key={r.id} className="mb-1">
            <summary>
              #{r.id} {r.operation} {r.workflow ?? ""} ·{" "}
              {r.sent_at ? "sent" : r.failed_at ? "FAILED" : "pending"} ·{" "}
              {r.last_status ?? "-"} · tries {r.attempts}
              {r.sent_at && (
                <button className="ml-2 underline" onClick={() => void resend(r.id)}>
                  resend
                </button>
              )}
            </summary>
            <pre className="whitespace-pre-wrap break-all">{r.payload}</pre>
            <pre className="whitespace-pre-wrap break-all">{r.last_response}</pre>
          </details>
        ))}
      </section>
      <section>
        <h2 className="mb-1 font-semibold">Client log</h2>
        <pre className="whitespace-pre-wrap">{log.join("\n")}</pre>
      </section>
    </aside>
  );
}

function FeedState({ feedClient }: { feedClient: Feed }) {
  const { items, metadata, networkStatus } = useNotificationStore(feedClient);
  return (
    <section>
      <h2 className="mb-1 font-semibold">Feed store</h2>
      <pre className="whitespace-pre-wrap">
        {`status ${networkStatus} · items ${items.length}\nunseen ${metadata.unseen_count} · unread ${metadata.unread_count} · total ${metadata.total_count}`}
      </pre>
      <button className="underline" onClick={() => void feedClient.fetch()}>
        Refetch
      </button>
      {items[0] && (
        <details>
          <summary>newest item (raw)</summary>
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(items[0], null, 1)}
          </pre>
        </details>
      )}
    </section>
  );
}
