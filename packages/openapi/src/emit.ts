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
writeFileSync(out, JSON.stringify(openApiDocument(origin), null, 2) + "\n");
console.log(`OpenAPI written to ${out} (server: ${origin}/api/v1)`);
