import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(".next/server/functions-config-manifest.json");
const middlewarePath = resolve(".next/server/middleware.js");
const expectedMatcher = "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)";

if (!existsSync(manifestPath) || !existsSync(middlewarePath)) {
  throw new Error("Next.js build did not emit the authentication proxy entry point.");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const proxy = manifest.functions?.["/_middleware"];
if (proxy?.runtime !== "nodejs"
    || !proxy.matchers?.some((matcher) => matcher.originalSource === expectedMatcher)) {
  throw new Error("Next.js build is missing the expected authentication proxy matcher.");
}

process.stdout.write("Next.js build manifest includes the authenticated application proxy and its route matcher.\n");
