// index.ts
import type { Config } from "@netlify/edge-functions";
import handler from "./lib/handler.ts";

export default handler;

export const config: Config = {
  method: ["GET"],
  path: "/*",
  // You can add edge-level HTML caching here later if you want:
  // cache: "manual",
};