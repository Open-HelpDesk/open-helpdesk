/**
 * S3-compatible storage (MinIO locally): attachments, article
 * images, workspace logo and favicon.
 * 10 MB limit per file (specs PT-04). Keys: {tenantId}/{messageId}/{uuid}-{name}.
 */
import { randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { attachments, db } from "@openhelpdesk/db";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const BUCKET = process.env.S3_BUCKET ?? "attachments";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9010",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "openhelpdesk",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "openhelpdesk",
  },
});

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } catch {
      /* race with another instance — HeadBucket will revalidate */
    }
  }
  bucketReady = true;
}

/**
 * Diagnostics probe (ST-01): fresh HeadBucket (without the bucketReady cache),
 * creation of the bucket if it does not exist yet — on a blank install, the app
 * only creates it on the first upload —, then writing and deleting a one-byte
 * witness object, outside the business prefixes. Any exception bubbles up to the
 * diagnostics, which displays it.
 */
export async function probeStorage(): Promise<{ bucket: string }> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    // Bucket missing or unreachable: CreateBucket settles it — it succeeds on a
    // blank instance and fails with the real error if S3 is down.
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  const key = `diagnostics/probe-${randomUUID()}`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: new Uint8Array([1]) }));
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  return { bucket: BUCKET };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-àâäéèêëîïôöùûüç ]/gi, "_").slice(0, 120) || "file";
}

/**
 * Saves the files of a FormData (`files` field): S3 object + attachments row.
 * Empty or oversized files are silently ignored (the UI displays the limit).
 */
export async function saveUploadedFiles(
  tenantId: string,
  messageId: string,
  files: File[],
): Promise<number> {
  const valid = files.filter(
    (f) => f && typeof f.arrayBuffer === "function" && f.size > 0 && f.size <= MAX_ATTACHMENT_BYTES,
  );
  if (valid.length === 0) return 0;
  await ensureBucket();

  for (const file of valid) {
    const filename = sanitizeFilename(file.name);
    const key = `${tenantId}/${messageId}/${randomUUID()}-${filename}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type || "application/octet-stream",
      }),
    );
    await db.insert(attachments).values({
      tenantId,
      messageId,
      storageKey: key,
      filename,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
  }
  return valid.length;
}

export async function getAttachmentBody(storageKey: string) {
  await ensureBucket();
  const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }));
  return result.Body;
}

/* ---------- Knowledge base article images ---------- */

const KB_PREFIX = "kb";

/**
 * Stores an article image and returns its read URL. The key carries the tenant:
 * that is what lets the public route refuse an image belonging to another
 * workspace.
 */
export async function saveKbImage(tenantId: string, file: File): Promise<string> {
  await ensureBucket();
  const filename = sanitizeFilename(file.name);
  const relative = `${tenantId}/${randomUUID()}-${filename}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${KB_PREFIX}/${relative}`,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type || "application/octet-stream",
    }),
  );
  return `/api/kb/images/${relative}`;
}

export async function getKbImageBody(relativeKey: string) {
  await ensureBucket();
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${KB_PREFIX}/${relativeKey}` }),
    );
    return result.Body;
  } catch {
    return null;
  }
}

/* ---------- Workspace logo and favicon (ST-01) ---------- */

const BRAND_PREFIX = "brand";

/**
 * A logo fits in a few tens of kilobytes and a favicon in a few hundred bytes:
 * two megabytes is already ample, and a low cap keeps a photo dropped by
 * mistake from becoming the portal's header.
 */
export const MAX_BRAND_BYTES = 2 * 1024 * 1024;

export type BrandAssetKind = "logo" | "favicon";

/**
 * Stores a logo or a favicon and returns its read URL.
 *
 * These objects do not go through the article images prefix, because they do not
 * have the same visibility rule: the portal logo must load even when the
 * knowledge base is not published, and the favicon even in the agent space,
 * which has nothing to do with the knowledge base.
 *
 * The name of the uploaded file is kept after the UUID: it is the part carrying
 * the extension, from which the read route infers the MIME type.
 */
export async function saveBrandAsset(
  tenantId: string,
  kind: BrandAssetKind,
  file: File,
): Promise<string> {
  await ensureBucket();
  const filename = sanitizeFilename(file.name);
  const relative = `${tenantId}/${kind}-${randomUUID()}-${filename}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${BRAND_PREFIX}/${relative}`,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type || "application/octet-stream",
    }),
  );
  return `/api/brand/${relative}`;
}

export async function getBrandAssetBody(relativeKey: string) {
  await ensureBucket();
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${BRAND_PREFIX}/${relativeKey}` }),
    );
    return result.Body;
  } catch {
    return null;
  }
}

/**
 * Deletes the object behind an `/api/brand/…` URL.
 *
 * Called when a logo is removed: without it, every replacement would leave an
 * orphan object in the bucket that no URL points to any more. The failure is
 * swallowed — a leftover object must not prevent the setting from being removed.
 */
export async function deleteBrandAsset(url: string): Promise<void> {
  const relative = url.startsWith("/api/brand/") ? url.slice("/api/brand/".length) : null;
  if (!relative) return;
  try {
    await ensureBucket();
    await s3.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: `${BRAND_PREFIX}/${relative}` }),
    );
  } catch {
    /* orphan tolerated: the setting matters more than the housekeeping */
  }
}
