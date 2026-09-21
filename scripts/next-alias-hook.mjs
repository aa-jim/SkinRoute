// scripts/next-alias-hook.mjs
//
// Minimal Node module-resolve hook that teaches plain `node` the two specifier
// shapes the planner sources rely on, so `scripts/verify-*.mjs` can import
// lib/planOrchestrator.js directly (no Next.js build, no dev server):
//
//   "@/..."  ->  <repo root>/...   (the Next.js / jsconfig path alias — e.g.
//                                   `import packsData from "@/data/packs.json"`)
//   "./x.js" / "../x.js" from a data: URL parent  ->  <repo root>/lib/x.js
//                                   (only used when a harness imports an
//                                   in-memory patched copy of a lib module)
//
// Registered via `register()` from the harness; never part of the app bundle.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const repoRootUrl = pathToFileURL(repoRoot + path.sep).href; // trailing separator kept

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(repoRootUrl + specifier.slice(2), context);
  }
  const fromData = context?.parentURL?.startsWith("data:");
  if (fromData && (specifier.startsWith("./") || specifier.startsWith("../"))) {
    return nextResolve(repoRootUrl + "lib/" + specifier.slice(2), context);
  }
  return nextResolve(specifier, context);
}