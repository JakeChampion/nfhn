// user.ts - User profile page
import type { Config, Context } from "@netlify/edge-functions";
import { handleNotFound, handleUser } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const username = context.params.username;

  if (!username) {
    return handleNotFound(request);
  }

  return handleUser(request, username);
};

export const config: Config = {
  method: ["GET"],
  path: "/user/:username",
};
