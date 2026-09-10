/**
 * Writes the OpenAPI document to a file.
 *
 *   pnpm --filter @openhelpdesk/openapi run emit -- --out openapi.json
 *
 * The documentation site builds from this, so the reference and the running API
 * come from the same source. A hand-copied snapshot would start lying the first
 * time a route changed, which is exactly what the old /docs did.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { openApiDocument } from "./index";
import { toPostmanCollection } from "./postman";

/**
 * Writes a file, creating its directory if it is missing.
 *
 * `writeFileSync` alone was enough on a laptop and failed in CI, which is the
 * whole point of this function existing. The documentation site wants the
 * collection under `apps/api-docs/public/`, that file is gitignored, and **git
 * does not track empty directories** — so the directory exists on a machine
 * where the file was once generated and nowhere else. CI got `ENOENT`, the
 * documentation build failed, and the cloud pipeline stayed red for three days.
 *
 * A build step that only works where its output already exists is not a build
 * step.
 */
function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

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

const doc = openApiDocument(origin, extra);
write(out, JSON.stringify(doc, null, 2) + "\n");
console.log(
  `OpenAPI written to ${out} (servers: ${[origin, ...extra].map((o) => `${o}/api/v1`).join(", ")})`,
);

/**
 * The Postman collection, beside it and from the same document.
 *
 * `--postman <path>` because the documentation site wants it as a static asset;
 * skipped when nobody asks, so the API's own openapi.json route stays a pure
 * read.
 */
const postman = flag("postman");
if (postman) {
  const collection = toPostmanCollection(doc as unknown as Record<string, unknown>);
  write(postman, JSON.stringify(collection, null, 2) + "\n");
  const count = (collection["item"] as { item: unknown[] }[]).reduce((n, f) => n + f.item.length, 0);
  console.log(`Postman collection written to ${postman} (${count} requests)`);
}
