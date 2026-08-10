// Build script for NFHN
// - Injects DEPLOY_ID into service worker for cache versioning
// - Derives the maskable icon variant from icon.svg

import { buildMaskableIcon } from "./icons.ts";

const DEPLOY_ID = Deno.env.get("DEPLOY_ID") || `dev-${Date.now()}`;

// Inject DEPLOY_ID into service worker
const swPath = "static/sw.js";
const swContent = await Deno.readTextFile(swPath);
const updatedSw = swContent.replace(/__DEPLOY_ID__/g, DEPLOY_ID);
await Deno.writeTextFile(swPath, updatedSw);

console.log(`✓ Injected DEPLOY_ID (${DEPLOY_ID}) into sw.js`);

// Derive the maskable icon. Generated rather than committed so it cannot drift
// from icon.svg - see scripts/icons.ts.
const iconSource = await Deno.readTextFile("static/icon.svg");
await Deno.writeTextFile("static/icon-maskable.svg", buildMaskableIcon(iconSource));

console.log("✓ Generated icon-maskable.svg from icon.svg");
