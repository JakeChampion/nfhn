// jobs.ts - Jobs feed
import type { Config, Context } from "@netlify/edge-functions";
import { handleFeed, handleNotFound, parsePositiveInt } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const pageNumber = parsePositiveInt(context.params.page);
  if (pageNumber === null) {
    return handleNotFound(request);
  }
  
  return handleFeed(
    request,
    "jobs",
    pageNumber,
    "No jobs found",
    "We couldn't find that page of jobs.",
  );
};

export const config: Config = {
  method: ["GET"],
  path: "/jobs/:page",
  cache: "manual",
};
