// Build script for NFHN
// - Injects DEPLOY_ID into service worker for cache versioning
// - Derives the maskable icon variant from icon.svg

import { buildMaskableIcon } from "./icons.ts";

const DEPLOY_ID = Deno.env.get("DEPLOY_ID") || `dev-${Date.now()}`;

// Inject DEPLOY_ID into the files that name a versioned URL.
//
// sw.js needs it for the cache name and for the `?v=` on the assets it precaches;
// offline.html needs it because its stylesheet link has to be the URL the worker
// precached. The edge functions read the same id at runtime from
// `context.deploy.id` rather than being stamped - see lib/deploy.ts.
for (const path of ["static/sw.js", "static/offline.html"]) {
  const content = await Deno.readTextFile(path);
  await Deno.writeTextFile(path, content.replace(/__DEPLOY_ID__/g, DEPLOY_ID));
  console.log(`✓ Injected DEPLOY_ID (${DEPLOY_ID}) into ${path}`);
}

// Derive the maskable icon. Generated rather than committed so it cannot drift
// from icon.svg - see scripts/icons.ts.
const iconSource = await Deno.readTextFile("static/icon.svg");
await Deno.writeTextFile("static/icon-maskable.svg", buildMaskableIcon(iconSource));

console.log("✓ Generated icon-maskable.svg from icon.svg");
