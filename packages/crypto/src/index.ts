/**
 * Chiffrement des secrets applicatifs au repos (AES-256-GCM).
 *
 * Sert aux identifiants d'envoi email (mots de passe SMTP, clés d'API) et aux secrets
 * de connexion SSO des organisations. La clé vient de `ENCRYPTION_KEY` (32 octets en
 * base64 ou hex, ou n'importe quelle chaîne longue) ; à défaut elle est dérivée de
 * `BETTER_AUTH_SECRET` pour que le développement fonctionne sans configuration.
 *
 * Format stocké : `v1.<iv base64url>.<tag base64url>.<chiffré base64url>` — le préfixe
 * de version permettra une rotation de clé sans deviner le format.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function keyMaterial(): string {
  const explicit = process.env.ENCRYPTION_KEY;
  if (explicit && explicit.length >= 16) return explicit;
  const fallback = process.env.BETTER_AUTH_SECRET;
  if (fallback && fallback.length >= 8) return fallback;
  // Développement sans configuration : clé stable mais publique, jamais en production.
  return "openhelpdesk-dev-encryption-key";
}

/** Clé 32 octets dérivée du matériel disponible (SHA-256 : longueur garantie). */
function key(): Buffer {
  return createHash("sha256").update(keyMaterial()).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/** Déchiffre, ou renvoie null si la valeur est illisible (clé changée, données corrompues). */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(parts[1]!, "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3]!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** Chiffre un objet de secrets (clés multiples : Mailjet a une clé et un secret). */
export function encryptSecrets(secrets: Record<string, string>): string {
  return encryptSecret(JSON.stringify(secrets));
}

export function decryptSecrets(payload: string | null | undefined): Record<string, string> {
  const raw = decryptSecret(payload);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Suffixe affichable d'un secret : « ••••••••1a2b » (jamais le secret entier). */
export function secretHint(secret: string): string {
  const tail = secret.slice(-4);
  return `${"•".repeat(Math.min(20, Math.max(4, secret.length - 4)))}${tail}`;
}

/** Vrai si l'instance tourne encore sur la clé de développement (bandeau d'alerte). */
export function usingDevEncryptionKey(): boolean {
  return !process.env.ENCRYPTION_KEY && !process.env.BETTER_AUTH_SECRET;
}

/**
 * Provenance du matériel de clé — miroir exact de keyMaterial(), pour que le
 * diagnostic (ST-01) qualifie l'installation sans dupliquer les seuils :
 * `explicit` = ENCRYPTION_KEY dédiée · `derived` = dérivée de
 * BETTER_AUTH_SECRET (acceptable, à corriger) · `dev` = clé publique de
 * développement (jamais en production).
 */
export function encryptionKeySource(): "explicit" | "derived" | "dev" {
  const explicit = process.env.ENCRYPTION_KEY;
  if (explicit && explicit.length >= 16) return "explicit";
  const fallback = process.env.BETTER_AUTH_SECRET;
  if (fallback && fallback.length >= 8) return "derived";
  return "dev";
}
