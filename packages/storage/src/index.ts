/**
 * Attachment storage, shared by everything that receives a file.
 *
 * It used to live inside apps/web, which meant only the web app could write an
 * attachment. Inbound email therefore *dropped* every file a customer attached:
 * the IMAP poller parsed them and threw them away, silently, because the code
 * that could have stored them was on the other side of the app boundary. Moving
 * it into a package is what makes an attachment reachable from the mail
 * pipeline, from an import, and from the app alike.
 *
 * S3-compatible (MinIO locally). Keys stay `{tenantId}/{messageId}/{uuid}-{name}`
 * so nothing that already reads them has to change.
 */
import { randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { attachments, db } from "@openhelpdesk/db";

/** Per-file ceiling (spec PT-04). Anything larger is refused, never truncated. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_BUCKET = process.env.S3_BUCKET ?? "attachments";

/**
 * Built on first use, never at import.
 *
 * Constructing it at module scope made every consumer of this package pay for
 * the AWS SDK the moment the module loaded — including the signup tunnel of the
 * marketing site, which imports the provisioning package, which imports the mail
 * package. Bundled by nitro, that construction threw at load time and the whole
 * import failed: the workspace availability check answered "cannot verify" for
 * every name, with the real cause three packages away.
 *
 * The environment is read here too, not at module scope, so a process that
 * never touches an attachment does not need S3 credentials to start.
 */
let client: S3Client | undefined;
export function s3(): S3Client {
  client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9010",
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "openhelpdesk",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "openhelpdesk",
    },
  });
  return client;
}

let bucketReady = false;
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  try {
    await s3().send(new HeadBucketCommand({ Bucket: ATTACHMENT_BUCKET }));
  } catch {
    try {
      await s3().send(new CreateBucketCommand({ Bucket: ATTACHMENT_BUCKET }));
    } catch {
      /* race with another instance — HeadBucket will revalidate */
    }
  }
  bucketReady = true;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-àâäéèêëîïôöùûüç ]/gi, "_").slice(0, 120) || "file";
}

/** A file to store, already in memory. */
export type IncomingFile = {
  filename: string;
  contentType?: string | null;
  content: Uint8Array;
};

export type StoredAttachment = {
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * Writes files to S3 and records them against a message.
 *
 * Returns what was stored rather than a count, so a caller can report exactly
 * which files came through — an import that says "3 of 5 attachments" is
 * useful; one that says "3" is not.
 *
 * Oversized and empty files are skipped, not truncated: half a PDF is worse
 * than a missing one, and the report names what was left behind.
 */
export async function storeAttachments(
  tenantId: string,
  messageId: string,
  files: IncomingFile[],
): Promise<{ stored: StoredAttachment[]; skipped: IncomingFile[] }> {
  const stored: StoredAttachment[] = [];
  const skipped: IncomingFile[] = [];
  const usable = files.filter((f) => {
    const size = f.content?.byteLength ?? 0;
    if (size === 0 || size > MAX_ATTACHMENT_BYTES) {
      if (size > 0) skipped.push(f);
      return false;
    }
    return true;
  });
  if (usable.length === 0) return { stored, skipped };

  await ensureBucket();
  for (const file of usable) {
    const filename = sanitizeFilename(file.filename);
    const contentType = file.contentType || "application/octet-stream";
    const key = `${tenantId}/${messageId}/${randomUUID()}-${filename}`;
    await s3().send(
      new PutObjectCommand({
        Bucket: ATTACHMENT_BUCKET,
        Key: key,
        Body: file.content,
        ContentType: contentType,
      }),
    );
    const row = {
      tenantId,
      messageId,
      storageKey: key,
      filename,
      contentType,
      sizeBytes: file.content.byteLength,
    };
    await db.insert(attachments).values(row);
    stored.push(row);
  }
  return { stored, skipped };
}
