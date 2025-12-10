// item.ts - Item/story page
import type { Config, Context } from "@netlify/edge-functions";
import { handleItem, handleNotFound, parsePositiveInt } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const id = parsePositiveInt(context.params.id);

  if (id === null) {
    return handleNotFound(request);
  }

  return handleItem(request, id);
};

export const config: Config = {
  method: ["GET"],
  path: "/item/:id",
  cache: "manual",
};
