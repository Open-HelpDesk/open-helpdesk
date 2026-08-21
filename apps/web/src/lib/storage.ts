/**
 * Stockage S3-compatible (MinIO en local, specs/01 § 3) : pièces jointes,
 * images d'articles, logo et favicon du workspace.
 * Limite 10 Mo par fichier (specs PT-04). Clés : {tenantId}/{messageId}/{uuid}-{nom}.
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
      /* course avec une autre instance — HeadBucket revalidera */
    }
  }
  bucketReady = true;
}

/**
 * Sonde du diagnostic (ST-01) : HeadBucket frais (sans le cache bucketReady),
 * création du bucket s'il n'existe pas encore — sur une installation vierge,
 * l'app ne le crée qu'au premier téléversement —, puis écriture et suppression
 * d'un objet témoin d'un octet, hors préfixes métier. Toute exception remonte
 * au diagnostic, qui l'affiche.
 */
export async function probeStorage(): Promise<{ bucket: string }> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    // Bucket absent ou injoignable : CreateBucket tranche — il réussit sur une
    // instance vierge et échoue avec la vraie erreur si S3 est en panne.
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  const key = `diagnostics/probe-${randomUUID()}`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: new Uint8Array([1]) }));
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  return { bucket: BUCKET };
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

/* ---------- Logo et favicon du workspace (ST-01) ---------- */

const BRAND_PREFIX = "brand";

/**
 * Un logo tient en quelques dizaines de kilo-octets et un favicon en quelques
 * centaines d'octets : deux mégaoctets sont déjà larges, et une limite basse
 * évite qu'une photo déposée par erreur devienne l'en-tête du portail.
 */
export const MAX_BRAND_BYTES = 2 * 1024 * 1024;

export type BrandAssetKind = "logo" | "favicon";

/**
 * Range un logo ou un favicon et renvoie son URL de lecture.
 *
 * Ces objets ne passent pas par le préfixe des images d'articles, parce qu'ils
 * n'ont pas la même règle de visibilité : le logo du portail doit se charger
 * même quand la base de connaissances n'est pas publiée, et le favicon même
 * dans l'espace agent, qui n'a rien à voir avec la base.
 *
 * Le nom du fichier déposé est conservé après l'UUID : c'est lui qui porte
 * l'extension, dont la route de lecture déduit le type MIME.
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
 * Supprime l'objet derrière une URL `/api/brand/…`.
 *
 * Appelée quand on retire un logo : sans elle, chaque remplacement laisserait
 * un objet orphelin dans le bucket, que plus aucune URL ne désigne. L'échec est
 * avalé — un objet resté en trop ne doit pas empêcher le réglage d'être retiré.
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
    /* orphelin toléré : le réglage compte plus que le ménage */
  }
}
