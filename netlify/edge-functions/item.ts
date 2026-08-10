// item.ts - Item/story page
import type { Config, Context } from "@netlify/edge-functions";
import {
  handleItem,
  handleNotFound,
  parsePositiveInt,
  withDictionaryEncoding,
} from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const id = parsePositiveInt(context.params.id);

  if (id === null) {
    return handleNotFound(request);
  }

  return withDictionaryEncoding(request, handleItem(request, id, context));
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
  path: "/item/:id",
  cache: "manual",
};
