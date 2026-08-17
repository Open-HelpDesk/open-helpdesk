/**
 * Stockage S3-compatible des pièces jointes (MinIO en local, specs/01 § 3).
 * Limite 10 Mo par fichier (specs PT-04). Clés : {tenantId}/{messageId}/{uuid}-{nom}.
 */
import { randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
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
      /* course avec une autre instance — HeadBucket revalidera */
    }
  }
  bucketReady = true;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-àâäéèêëîïôöùûüç ]/gi, "_").slice(0, 120) || "fichier";
}

/**
 * Enregistre les fichiers d'un FormData (champ `files`) : objet S3 + ligne attachments.
 * Les fichiers vides ou trop lourds sont ignorés silencieusement (l'UI affiche la limite).
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

/* ---------- Images des articles de la base de connaissances ---------- */

const KB_PREFIX = "kb";

/**
 * Range une image d'article et renvoie son URL de lecture. La clé porte le
 * tenant : c'est ce qui permet à la route publique de refuser une image
 * appartenant à un autre workspace.
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
