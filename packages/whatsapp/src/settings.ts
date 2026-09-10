/**
 * Reading and writing a workspace's WhatsApp configuration.
 *
 * The secrets are encrypted at rest (@openhelpdesk/crypto) and never leave this
 * module in clear except to the two callers that must have them: the signature
 * check and the send. `secretHint` is what the settings screen shows, so an
 * operator can tell whether the token was replaced without ever displaying it.
 */
import { and, eq } from "drizzle-orm";
import { decryptSecrets, encryptSecrets, secretHint } from "@openhelpdesk/crypto";
import { db, whatsappSettings } from "@openhelpdesk/db";
import type { WhatsappConfig } from "./types";

export type WhatsappSettingsRow = typeof whatsappSettings.$inferSelect;

/** The row for a workspace, secrets still encrypted. */
export async function getWhatsappSettings(tenantId: string): Promise<WhatsappSettingsRow | null> {
  const [row] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.tenantId, tenantId));
  return row ?? null;
}

/**
 * Resolve a workspace from the `phone_number_id` of an inbound event.
 *
 * This is the WhatsApp equivalent of resolving a tenant from an inbound
 * email's recipient mailbox, and it is why that column is unique across the
 * instance: Meta sends every event of a business account to one URL, and this
 * id is the only tenant discriminator in the payload.
 *
 * Returns null when no workspace claims the number, or when the channel is off
 * — the caller must distinguish the two, so `active` is checked by the ingest
 * and not hidden here.
 */
export async function settingsForPhoneNumberId(
  phoneNumberId: string,
): Promise<WhatsappSettingsRow | null> {
  if (!phoneNumberId) return null;
  const [row] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.phoneNumberId, phoneNumberId));
  return row ?? null;
}

/**
 * The usable configuration: secrets decrypted.
 *
 * Returns null when a secret is missing rather than an object with empty
 * strings. An empty app secret would make `verifySignature` refuse everything,
 * which is the right outcome but the wrong error message — the operator needs
 * to be told the channel is not configured, not that the signature is invalid.
 */
export function resolveConfig(row: WhatsappSettingsRow): WhatsappConfig | null {
  const secrets = decryptSecrets(row.encryptedSecrets);
  const accessToken = secrets["accessToken"] ?? "";
  const appSecret = secrets["appSecret"] ?? "";
  const verifyToken = secrets["verifyToken"] ?? "";
  if (!accessToken || !appSecret || !verifyToken) return null;
  return {
    tenantId: row.tenantId,
    phoneNumberId: row.phoneNumberId,
    displayPhone: row.displayPhone,
    defaultTeamId: row.defaultTeamId,
    accessToken,
    appSecret,
    verifyToken,
  };
}

export type SaveWhatsappInput = {
  tenantId: string;
  phoneNumberId: string;
  displayPhone?: string | null;
  wabaId?: string | null;
  defaultTeamId?: string | null;
  templateName?: string | null;
  templateLang?: string | null;
  active?: boolean;
  /** Omit a field to keep the stored one — the screen never re-sends secrets. */
  accessToken?: string;
  appSecret?: string;
  verifyToken?: string;
};

/**
 * Create or update the configuration, keeping any secret the caller omitted.
 *
 * The "omit to keep" rule matters: a settings form that required all three
 * secrets on every save would force an operator to re-type an access token to
 * change a team, and re-typing a secret is how secrets end up in clipboards
 * and screenshots.
 */
export async function saveWhatsappSettings(input: SaveWhatsappInput): Promise<WhatsappSettingsRow> {
  const existing = await getWhatsappSettings(input.tenantId);
  const current = decryptSecrets(existing?.encryptedSecrets);
  const merged: Record<string, string> = {
    accessToken: input.accessToken ?? current["accessToken"] ?? "",
    appSecret: input.appSecret ?? current["appSecret"] ?? "",
    verifyToken: input.verifyToken ?? current["verifyToken"] ?? "",
  };
  for (const key of Object.keys(merged)) if (!merged[key]) delete merged[key];

  const values = {
    tenantId: input.tenantId,
    phoneNumberId: input.phoneNumberId,
    displayPhone: input.displayPhone ?? null,
    wabaId: input.wabaId ?? null,
    defaultTeamId: input.defaultTeamId ?? null,
    /*
     * Les deux ou aucun. Un nom sans code de langue est refusé par Meta, et un
     * code sans nom ne désigne aucun gabarit : garder la moitié produirait un
     * canal qui paraît prêt à rouvrir une conversation et n'y arrive pas. On
     * préfère le champ vide, qui est un état honnête — les réponses hors
     * fenêtre sont alors refusées, et l'écran le dit.
     */
    templateName: input.templateName && input.templateLang ? input.templateName : null,
    templateLang: input.templateName && input.templateLang ? input.templateLang : null,
    active: input.active ?? existing?.active ?? false,
    encryptedSecrets: Object.keys(merged).length ? encryptSecrets(merged) : null,
    // The hint is on the access token: it is the one an operator rotates.
    secretHint: merged["accessToken"] ? secretHint(merged["accessToken"]) : null,
    updatedAt: new Date(),
  };

  if (existing) {
    const [row] = await db
      .update(whatsappSettings)
      .set(values)
      .where(eq(whatsappSettings.tenantId, input.tenantId))
      .returning();
    return row!;
  }
  const [row] = await db.insert(whatsappSettings).values(values).returning();
  return row!;
}

/** Switch the channel off without losing its credentials. */
export async function setWhatsappActive(tenantId: string, active: boolean): Promise<void> {
  await db
    .update(whatsappSettings)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(whatsappSettings.tenantId, tenantId)));
}
