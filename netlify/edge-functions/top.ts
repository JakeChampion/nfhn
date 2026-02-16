// top.ts - Top stories feed
import type { Config, Context } from "@netlify/edge-functions";
// import { handleFeed, handleNotFound, parsePositiveInt } from "./lib/handlers.ts";

export default (_request: Request, _context: Context) => {
  return new Response(`meow`);
  // const pageNumber = parsePositiveInt(context.params.page);
  // if (pageNumber === null) {
  //   return handleNotFound(request);
  // }

  // return handleFeed(
  //   request,
  //   "top",
  //   pageNumber,
  //   "No stories found",
  //   "We couldn't find that page of top stories.",
  // );
};

export const config: Config = {
  method: ["GET"],
  path: "/top/:page",
};
