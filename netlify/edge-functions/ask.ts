// ask.ts - Ask HN feed
import type { Config, Context } from "@netlify/edge-functions";
import { handleFeed, parsePositiveInt, redirect } from "./lib/handlers.ts";

export default (request: Request, context: Context) => {
  const page = context.params.page;
  
  // Bare /ask or /ask/ redirects to /ask/1
  if (!page) {
    return redirect("/ask/1");
  }
  
  const pageNumber = parsePositiveInt(page);
  if (pageNumber === null) {
    return redirect("/ask/1");
  }
  
  return handleFeed(
    request,
    "ask",
    pageNumber,
    "No stories found",
    "We couldn't find that page of Ask HN posts.",
  );
};

export const config: Config = {
  method: ["GET"],
  path: ["/ask", "/ask/:page"],
  cache: "manual",
};
