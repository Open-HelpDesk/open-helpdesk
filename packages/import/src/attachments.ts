/**
 * Fetching the files an export only names.
 *
 * Zendesk hands out URLs, not bytes, and those URLs stop working once the
 * customer's account is closed. This is therefore the part of a migration with
 * a deadline: the tickets can be re-imported next month, the screenshots cannot.
 *
 * Everything here is best-effort by design. A file that 404s, times out or
 * exceeds our 10 MB ceiling produces a line in the report and nothing else —
 * losing a whole import because one attachment went missing would be absurd.
 */
import { MAX_ATTACHMENT_BYTES, storeAttachments } from "@openhelpdesk/storage";
import type { Anomaly, ObjectCounts, SourceAttachment } from "./types";

/** Slow enough for a large PDF, short enough not to stall a whole run. */
const TIMEOUT_MS = 30_000;

/**
 * How many files are fetched at once.
 *
 * Zendesk rate-limits hard, and a migration that gets throttled halfway is
 * worse than one that takes longer: four at a time is brisk without being
 * rude to the source.
 */
const CONCURRENCY = 4;

export type FetchOptions = {
  /**
   * Credentials for the source. Zendesk accepts `Bearer <oauth token>` or
   * basic auth built from `user/token:<api token>`; we pass whatever the caller
   * assembled rather than guessing here.
   */
  authorization?: string | null;
  fetchImpl?: typeof fetch;
};

async function download(
  file: SourceAttachment,
  options: FetchOptions,
): Promise<{ content: Uint8Array } | { error: Anomaly["kind"]; detail: string }> {
  // A size the source already told us about: no point spending a request to
  // discover we must refuse it.
  if (file.sizeBytes && file.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { error: "attachment_too_large", detail: `${Math.round(file.sizeBytes / 1024)} kB` };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await doFetch(file.url, {
      signal: controller.signal,
      headers: options.authorization ? { authorization: options.authorization } : undefined,
    });
    if (!response.ok) {
      return { error: "attachment_unreachable", detail: `HTTP ${response.status}` };
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { error: "attachment_unreachable", detail: "empty response" };
    }
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return { error: "attachment_too_large", detail: `${Math.round(buffer.byteLength / 1024)} kB` };
    }
    return { content: buffer };
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timed out" : "unreachable";
    return { error: "attachment_unreachable", detail: reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads the files of one message and stores them against it.
 *
 * `messageId` is ours, not the source's: the message row must exist before its
 * files can point at it.
 */
export async function fetchAndStoreAttachments(
  tenantId: string,
  messageId: string,
  files: SourceAttachment[],
  options: FetchOptions,
  counts: ObjectCounts,
  anomalies: Anomaly[],
  externalId: string,
): Promise<void> {
  if (files.length === 0) return;
  counts.seen += files.length;

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const slice = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((file) => download(file, options)));

    const ready: { filename: string; contentType?: string | null; content: Uint8Array }[] = [];
    results.forEach((result, index) => {
      const file = slice[index]!;
      if ("error" in result) {
        counts.failed += 1;
        anomalies.push({
          kind: result.error,
          object: "attachment",
          externalId,
          detail: `${file.filename} — ${result.detail}`,
        });
        return;
      }
      ready.push({
        filename: file.filename,
        contentType: file.contentType,
        content: result.content,
      });
    });

    if (ready.length === 0) continue;
    try {
      const { stored, skipped } = await storeAttachments(tenantId, messageId, ready);
      counts.created += stored.length;
      counts.failed += skipped.length;
      for (const file of skipped) {
        anomalies.push({
          kind: "attachment_too_large",
          object: "attachment",
          externalId,
          detail: file.filename,
        });
      }
    } catch (err) {
      counts.failed += ready.length;
      anomalies.push({
        kind: "write_failed",
        object: "attachment",
        externalId,
        detail: err instanceof Error ? err.message.slice(0, 120) : "storage error",
      });
    }
  }
}
