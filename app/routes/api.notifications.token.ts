// PROTOTYPE — throwaway (issue #17). GET /api/notifications/token
import { data } from "react-router";
import type { Route } from "./+types/api.notifications.token";
import { getCurrentUserId } from "~/lib/session";
import { knockConfig, signFeedToken } from "~/lib/notifications.prototype.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Not signed in", { status: 401 });
  const cfg = knockConfig();
  if (!cfg) return new Response(null, { status: 204 });
  const { token, expiresAt } = signFeedToken(userId);
  // Prototype shortcut: the public key and channel id ride along here.
  return Response.json(
    {
      userId: String(userId),
      token,
      expiresAt,
      publicApiKey: cfg.publicKey,
      feedChannelId: cfg.channelId,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
