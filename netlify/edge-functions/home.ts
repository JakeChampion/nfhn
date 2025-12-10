// home.ts - Redirect / to /top/1
import type { Config } from "@netlify/edge-functions";
import { redirect } from "./lib/handlers.ts";

export default () => redirect("/top/1");

export const config: Config = {
  method: ["GET"],
  path: "/",
  cache: "manual",
};
