// jobs.ts - Jobs feed
import type { Config, Context } from "@netlify/edge-functions";
import { handleFeed, parsePositiveInt, redirect } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const page = context.params.page;
  
  // Bare /jobs or /jobs/ redirects to /jobs/1
  if (!page) {
    return redirect("/jobs/1");
  }
  
  const pageNumber = parsePositiveInt(page);
  if (pageNumber === null) {
    return redirect("/jobs/1");
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
  path: ["/jobs", "/jobs/:page"],
  cache: "manual",
};
