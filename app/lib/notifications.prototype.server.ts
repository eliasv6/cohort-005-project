// PROTOTYPE — throwaway, never merge. Branch: prototype/knock-discussion.
// Answers "Prototype: one Discussion Notification end to end on Knock
// development" (issue #17). The single module that creates Notifications,
// for one type only: question-answered. No tests, minimal error handling.
//
// The outbox is a raw table, `prototype_notification_outbox` (wipe me), created
// on first use rather than by a migration.

import { createSign } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db, getSqlite } from "~/db";
import {
  comments,
  courses,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";

// ── Config ────────────────────────────────────────────────────────────────

function loadEnv() {
  if (process.env.KNOCK_API_KEY) return;
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env: the local fallback (no keys) applies
  }
}

export function knockConfig() {
  loadEnv();
  const {
    KNOCK_API_KEY,
    KNOCK_PUBLIC_API_KEY,
    KNOCK_SIGNING_KEY,
    KNOCK_FEED_CHANNEL_ID,
  } = process.env;
  if (
    !KNOCK_API_KEY ||
    !KNOCK_PUBLIC_API_KEY ||
    !KNOCK_SIGNING_KEY ||
    !KNOCK_FEED_CHANNEL_ID
  ) {
    return null;
  }
  return {
    secretKey: KNOCK_API_KEY,
    publicKey: KNOCK_PUBLIC_API_KEY,
    signingKey: KNOCK_SIGNING_KEY,
    channelId: KNOCK_FEED_CHANNEL_ID,
  };
}

const API = "https://api.knock.app/v1";

// One constant: workflow key, category, tab. The read-all route reads it.
export const NOTIFICATION_TYPES = {
  "question-answered": { category: "discussion", tab: "discussion" },
} as const;
export type Tab = "all" | "unread" | "discussion";
export function workflowsForTab(tab: Tab): string[] | undefined {
  if (tab === "all" || tab === "unread") return undefined;
  return Object.entries(NOTIFICATION_TYPES)
    .filter(([, t]) => t.tab === tab)
    .map(([key]) => key);
}

// ── Outbox ────────────────────────────────────────────────────────────────

let tableReady = false;
function ensureOutbox() {
  if (tableReady) return;
  getSqlite().exec(`
    CREATE TABLE IF NOT EXISTS prototype_notification_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,          -- trigger | archive
      workflow TEXT,
      payload TEXT NOT NULL,            -- JSON body sent to Knock
      created_at TEXT NOT NULL,
      sent_at TEXT,
      failed_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_status INTEGER,
      last_response TEXT,
      bulk_operation_id TEXT
    )`);
  tableReady = true;
}

type OutboxRow = {
  id: number;
  operation: "trigger" | "archive";
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

function enqueue(
  operation: OutboxRow["operation"],
  workflow: string | null,
  payload: unknown
) {
  ensureOutbox();
  // Same better-sqlite3 connection as the caller's db.transaction, so this row
  // commits or rolls back with the event.
  getSqlite()
    .prepare(
      `INSERT INTO prototype_notification_outbox (operation, workflow, payload, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(operation, workflow, JSON.stringify(payload), new Date().toISOString());
}

export function listOutbox(): OutboxRow[] {
  ensureOutbox();
  return getSqlite()
    .prepare(
      `SELECT * FROM prototype_notification_outbox ORDER BY id DESC LIMIT 30`
    )
    .all() as OutboxRow[];
}

// ── Domain: what a Reply creates ──────────────────────────────────────────

function isAnswerAuthor(userId: number, instructorId: number | null) {
  if (userId === instructorId) return true;
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  return u?.role === UserRole.Admin;
}

/**
 * Call inside the transaction that inserted the Reply. Enqueues
 * question-answered when this Reply takes its Question from unanswered to
 * answered. (Types 2 and 11 are out of the prototype.)
 */
export function notifyReplyPosted(replyId: number) {
  const reply = db.select().from(comments).where(eq(comments.id, replyId)).get();
  if (!reply || reply.parentId === null) return;

  const question = db
    .select()
    .from(comments)
    .where(eq(comments.id, reply.parentId))
    .get();
  if (!question) return;

  const ctx = db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
      lessonTitle: lessons.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, reply.lessonId))
    .get();
  if (!ctx) return;

  if (!isAnswerAuthor(reply.userId, ctx.instructorId)) return;
  if (question.userId === reply.userId) return; // the Reply's author is skipped

  // Was the Question already answered by another live Answer?
  const otherReplies = db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.parentId, question.id),
        isNull(comments.deletedAt),
        ne(comments.id, reply.id)
      )
    )
    .all();
  if (otherReplies.some((r) => isAnswerAuthor(r.userId, ctx.instructorId))) {
    return;
  }

  const actor = db.select().from(users).where(eq(users.id, reply.userId)).get();
  const recipient = db
    .select()
    .from(users)
    .where(eq(users.id, question.userId))
    .get();
  if (!actor || !recipient) return;

  const occurredAt = new Date().toISOString();
  enqueue("trigger", "question-answered", {
    // Inline identification so dev doesn't need a separate identify step.
    recipients: [{ id: String(recipient.id), name: recipient.name }],
    actor: { id: String(actor.id), name: actor.name },
    data: {
      course_id: String(ctx.courseId),
      lesson_id: String(reply.lessonId),
      question_id: String(question.id),
      reply_id: String(reply.id),
      course_title: ctx.courseTitle,
      lesson_title: ctx.lessonTitle,
      url: `/courses/${ctx.courseSlug}/lessons/${reply.lessonId}#comment-${question.id}`,
      occurred_at: occurredAt,
    },
  });
}

/** Call inside the transaction that soft-deleted the Reply. */
export function notifyReplyDeleted(replyId: number) {
  enqueue("archive", null, {
    trigger_data: JSON.stringify({ reply_id: String(replyId) }),
    engagement_status: "unread",
  });
}

// ── Drainer ───────────────────────────────────────────────────────────────

let draining = false;

/** Nudge after commit. Never awaited by the request. */
export function nudgeDrainer() {
  setImmediate(() => void drain());
}

async function knock(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const cfg = knockConfig()!;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.secretKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

async function drain() {
  if (draining) return;
  const cfg = knockConfig();
  if (!cfg) return; // fake: rows stay unsent, visible in the debug panel
  draining = true;
  try {
    ensureOutbox();
    const sqlite = getSqlite();
    const rows = sqlite
      .prepare(
        `SELECT * FROM prototype_notification_outbox
         WHERE sent_at IS NULL AND failed_at IS NULL ORDER BY id`
      )
      .all() as OutboxRow[];

    for (const row of rows) {
      const payload = JSON.parse(row.payload);
      const res =
        row.operation === "trigger"
          ? await knock("POST", `/workflows/${row.workflow}/trigger`, payload, {
              "Idempotency-Key": `outbox-${row.id}`,
            })
          : await knock(
              "POST",
              `/channels/${cfg.channelId}/messages/bulk/archive`,
              payload
            );

      const ok = res.status >= 200 && res.status < 300;
      const permanent = !ok && res.status >= 400 && res.status < 500 && res.status !== 429;
      const bulkId =
        row.operation === "archive" && ok
          ? ((res.json as { id?: string }).id ?? null)
          : null;
      const replayed = res.headers.get("idempotent-replayed");
      sqlite
        .prepare(
          `UPDATE prototype_notification_outbox
           SET attempts = attempts + 1, last_status = ?, last_response = ?,
               sent_at = ?, failed_at = ?, bulk_operation_id = ?
           WHERE id = ?`
        )
        .run(
          res.status,
          JSON.stringify({ replayed, body: res.json }),
          ok ? new Date().toISOString() : null,
          permanent ? new Date().toISOString() : null,
          bulkId,
          row.id
        );
      if (!ok) {
        console.error("[prototype outbox]", row.id, res.status, res.json);
        if (!permanent) {
          // Retryable: try again in 30s (no full backoff in the prototype).
          setTimeout(() => void drain(), 30_000);
          break;
        }
      }
    }
  } finally {
    draining = false;
  }
}

/** Re-send one row with the same idempotency key (debug: does Knock replay?). */
export async function resendRow(id: number) {
  ensureOutbox();
  getSqlite()
    .prepare(
      `UPDATE prototype_notification_outbox SET sent_at = NULL, failed_at = NULL WHERE id = ?`
    )
    .run(id);
  await drain();
}

// ── Feed token, bulk read, bulk operation status ─────────────────────────

export function signFeedToken(userId: number, expiresInSeconds = 3600) {
  const cfg = knockConfig()!;
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    sub: String(userId),
    iat: now,
    exp: now + expiresInSeconds,
  })}`;
  const pem = Buffer.from(cfg.signingKey, "base64").toString("utf8");
  const sig = createSign("RSA-SHA256").update(head).sign(pem).toString("base64url");
  return { token: `${head}.${sig}`, expiresAt: (now + expiresInSeconds) * 1000 };
}

export async function bulkReadAll(userId: number, tab: Tab, before: string) {
  const cfg = knockConfig()!;
  const workflows = workflowsForTab(tab);
  const body = {
    recipient_ids: [String(userId)],
    engagement_status: "unread",
    older_than: before,
    ...(workflows ? { workflows } : {}),
  };
  const res = await knock(
    "POST",
    `/channels/${cfg.channelId}/messages/bulk/read`,
    body
  );
  return { request: body, ...res, headers: undefined };
}

export async function getBulkOperation(id: string) {
  const res = await knock("GET", `/bulk_operations/${id}`);
  return { status: res.status, json: res.json };
}
