// user.ts - User profile page
import type { Config, Context } from "@netlify/edge-functions";
import { handleNotFound, handleUser } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const username = context.params.username;

  if (!username) {
    return handleNotFound(request);
  }

  return handleUser(request, username, context);
};

export const config: Config = {
  rateLimit: {
    // Deliberately generous - see docs/netlify-proposals/04-rate-limiting.md.
    // Values are inlined because Netlify parses `config` without executing the
    // module, so constants from config.ts cannot be referenced here.
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: "ip",
  },
  method: ["GET"],
  path: "/user/:username",
};
