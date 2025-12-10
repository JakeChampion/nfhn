// index.ts
import type { Config } from "@netlify/edge-functions";
import handler from "./lib/handler.ts";

export default handler;

export const config: Config = {
  method: ["GET"],
  path: "/*",
  excludedPath: [
    "/icon.svg",
    "/styles.css",
  ],
  cache: "manual",
};
