/**
 * Écrire les réglages de l'assistant.
 *
 * Séparé de `governance.ts`, qui ne fait que lire et journaliser : ici on
 * change ce que l'espace autorise, et chaque écriture est une décision qu'un
 * humain a prise sur l'écran ST-15.
 *
 * La ligne est créée à la demande (`upsert`) plutôt qu'au provisionnement d'un
 * espace : un tenant qui n'a jamais ouvert l'écran doit se comporter comme le
 * défaut, et non comme une ligne vide écrite six mois plus tôt par une version
 * du produit qui ne connaissait pas la moitié des colonnes.
 */
import { eq } from "drizzle-orm";
import { aiSettings, db, type AiCapability } from "@openhelpdesk/db";
import { AI_CAPABILITIES } from "./governance";

export type AiSettingsPatch = {
  enabled?: boolean;
  capabilities?: Partial<Record<AiCapability, boolean>>;
  sources?: { kb: boolean; macros: boolean; resolvedTickets: boolean; internalNotes: boolean };
  deflectionLocales?: string[];
  deflectionThreshold?: number;
  /** `null` efface le modèle apporté et rend l'espace au fournisseur hébergé. */
  byo?: { endpoint: string; model: string; secret: string | null } | null;
};

/** Le plancher de confiance, borné : en dessous de 50 une réponse au client n'a plus de sens. */
export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return 70;
  return Math.min(99, Math.max(50, Math.round(value)));
}

/** Ne garde que des capacités connues : une clé inventée dans un formulaire ne s'écrit pas. */
export function sanitizeCapabilities(
  input: Record<string, unknown>,
): Partial<Record<AiCapability, boolean>> {
  const out: Partial<Record<AiCapability, boolean>> = {};
  for (const cap of AI_CAPABILITIES) {
    const v = input[cap];
    if (typeof v === "boolean") out[cap] = v;
  }
  return out;
}

/**
 * Ne garde que des codes de langue que le produit sert.
 *
 * `allowed` vient de l'appelant (la liste des locales du produit) pour que ce
 * paquet n'ait pas à la connaître — et pour qu'une langue retirée du produit ne
 * reste pas ouverte à la déflexion dans une ligne oubliée.
 */
export function sanitizeLocales(input: string[], allowed: readonly string[]): string[] {
  const set = new Set(allowed);
  return [...new Set(input.map((l) => l.trim().toLowerCase()))].filter((l) => set.has(l)).sort();
}

export async function saveAiSettings(tenantId: string, patch: AiSettingsPatch): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.enabled !== undefined) values.enabled = patch.enabled;
  if (patch.capabilities !== undefined) values.capabilities = patch.capabilities;
  if (patch.sources !== undefined) values.sources = patch.sources;
  if (patch.deflectionLocales !== undefined) values.deflectionLocales = patch.deflectionLocales;
  if (patch.deflectionThreshold !== undefined) {
    values.deflectionThreshold = clampThreshold(patch.deflectionThreshold);
  }
  if (patch.byo !== undefined) {
    if (patch.byo === null) {
      values.byoEndpoint = null;
      values.byoModel = null;
      values.byoSecret = null;
    } else {
      values.byoEndpoint = patch.byo.endpoint;
      values.byoModel = patch.byo.model;
      /* Une clé absente du formulaire ne l'efface pas : le champ arrive vide
         quand l'admin ne la retape pas, et confondre « vide » avec « retire-la »
         couperait l'assistant à chaque enregistrement. */
      if (patch.byo.secret !== null) values.byoSecret = patch.byo.secret;
    }
  }
  values.updatedAt = new Date();

  const [existing] = await db
    .select({ id: aiSettings.id })
    .from(aiSettings)
    .where(eq(aiSettings.tenantId, tenantId));

  if (existing) {
    await db.update(aiSettings).set(values).where(eq(aiSettings.id, existing.id));
    return;
  }
  await db.insert(aiSettings).values({ tenantId, ...values });
}
