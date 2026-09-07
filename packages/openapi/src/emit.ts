/**
 * Writes the OpenAPI document to a file.
 *
 *   pnpm --filter @openhelpdesk/openapi run emit -- --out openapi.json
 *
 * The documentation site builds from this, so the reference and the running API
 * come from the same source. A hand-copied snapshot would start lying the first
 * time a route changed, which is exactly what the old /docs did.
 */
import { writeFileSync } from "node:fs";
import { openApiDocument } from "./index";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const out = flag("out") ?? "openapi.json";
const origin = flag("origin") ?? "https://{workspace}.open-helpdesk.com";
/**
 * `--local <origin>` adds a second server to the document. Used when serving
 * the documentation on a laptop: the playground then offers the running
 * instance, and "Test" does something.
 */
const local = flag("local");
const extra = local ? [local] : [];

writeFileSync(out, JSON.stringify(openApiDocument(origin, extra), null, 2) + "\n");
console.log(
  `OpenAPI written to ${out} (servers: ${[origin, ...extra].map((o) => `${o}/api/v1`).join(", ")})`,
);
