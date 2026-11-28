// PROTOTYPE — throwaway (issue #17). Debug state for the Inbox's prototype panel.
// GET: outbox rows (+ bulk operation status). POST { resend: id } or { bulk: id }.
import type { Route } from "./+types/api.notifications.prototype";
import {
  getBulkOperation,
  knockConfig,
  listOutbox,
  nudgeDrainer,
  resendRow,
} from "~/lib/notifications.prototype.server";

export async function loader() {
  nudgeDrainer(); // "once at start" stand-in: any unsent rows go now
  return Response.json({ configured: !!knockConfig(), outbox: listOutbox() });
}

export async function action({ request }: Route.ActionArgs) {
  const body = (await request.json()) as { resend?: number; bulk?: string };
  if (body.resend) {
    await resendRow(body.resend);
    return Response.json({ ok: true, outbox: listOutbox() });
  }
  if (body.bulk) return Response.json(await getBulkOperation(body.bulk));
  return Response.json({ ok: false }, { status: 400 });
}
