"use server";

/**
 * ST-15 — les écritures de l'écran de gouvernance de l'assistant.
 *
 * Un seul enregistrement pour tout l'écran : un admin qui coupe une source et
 * relève un seuil dans le même geste n'a pas à s'en souvenir en deux temps. Le
 * modèle apporté par l'espace (BYO LLM) a son propre bouton, parce que son
 * effacement est une décision distincte et non un champ vidé par distraction.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { encryptSecret } from "@openhelpdesk/crypto";
import { LOCALES } from "@/i18n/locales";
import { requireManager } from "@/lib/session";
import {
  AI_CAPABILITIES,
  sanitizeCapabilities,
  sanitizeLocales,
  saveAiSettings,
} from "@openhelpdesk/ee-ai";

const PATH = "/app/settings/assistant";

export async function saveAssistant(formData: FormData) {
  const { tenant } = await requireManager();

  /* Une case décochée n'arrive pas dans le FormData : l'absence vaut « éteint ».
     D'où la boucle sur la liste connue plutôt que sur ce que le formulaire a
     envoyé — sinon éteindre une fonction ne l'éteindrait jamais. */
  const capabilities = sanitizeCapabilities(
    Object.fromEntries(AI_CAPABILITIES.map((cap) => [cap, formData.get(`cap.${cap}`) === "on"])),
  );

  await saveAiSettings(tenant.id, {
    enabled: formData.get("enabled") === "on",
    capabilities,
    sources: {
      kb: formData.get("source.kb") === "on",
      macros: formData.get("source.macros") === "on",
      resolvedTickets: formData.get("source.resolvedTickets") === "on",
      internalNotes: formData.get("source.internalNotes") === "on",
    },
    deflectionLocales: sanitizeLocales(
      formData.getAll("locale").map((l) => String(l)),
      LOCALES.map((l) => l.code),
    ),
    deflectionThreshold: Number(formData.get("threshold") ?? 70),
  });

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function saveByoModel(formData: FormData) {
  const { tenant } = await requireManager();
  const endpoint = String(formData.get("byoEndpoint") ?? "").trim();
  const model = String(formData.get("byoModel") ?? "").trim();
  const secret = String(formData.get("byoSecret") ?? "").trim();

  /* Sans les deux, il n'y a pas de modèle à brancher : on revient au
     fournisseur hébergé plutôt que d'enregistrer une configuration à moitié
     qui échouerait au premier appel. */
  if (!endpoint || !model) {
    await saveAiSettings(tenant.id, { byo: null });
    revalidatePath(PATH);
    redirect(`${PATH}?saved=1`);
  }

  /* http accepté pour un modèle sur le réseau du client, pas pour un endpoint
     public : une clé d'API en clair sur l'internet ouvert n'est pas une option
     que le produit doit rendre facile. */
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    redirect(`${PATH}?error=endpoint`);
  }
  const localish = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(url.hostname);
  if (url.protocol !== "https:" && !localish) redirect(`${PATH}?error=insecure`);

  await saveAiSettings(tenant.id, {
    byo: {
      endpoint: `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`,
      model,
      secret: secret ? encryptSecret(secret) : null,
    },
  });

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function clearByoModel() {
  const { tenant } = await requireManager();
  await saveAiSettings(tenant.id, { byo: null });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}
