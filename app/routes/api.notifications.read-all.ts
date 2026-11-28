// PROTOTYPE — throwaway (issue #17). POST /api/notifications/read-all { tab, before }
import { data } from "react-router";
import type { Route } from "./+types/api.notifications.read-all";
import { getCurrentUserId } from "~/lib/session";
import {
  bulkReadAll,
  knockConfig,
  type Tab,
} from "~/lib/notifications.prototype.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Not signed in", { status: 401 });
  if (!knockConfig()) return new Response(null, { status: 204 });
  const { tab, before } = (await request.json()) as { tab: Tab; before: string };
  const result = await bulkReadAll(userId, tab, before);
  return Response.json(result, {
    status: result.status >= 200 && result.status < 300 ? 200 : 502,
  });
}
