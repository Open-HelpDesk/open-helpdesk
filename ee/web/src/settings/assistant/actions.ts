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
import { decryptSecret } from "@openhelpdesk/crypto";
import {
  AI_CAPABILITIES,
  getAiSettings,
  providerFor,
  reindexWorkspace,
  sanitizeCapabilities,
  sanitizeLocales,
  saveAiSettings,
} from "@openhelpdesk/ee-ai";

const PATH = "/app/settings/assistant";

export async function saveAssistant(formData: FormData) {
  const { tenant, agent } = await requireManager();

  /* Une case décochée n'arrive pas dans le FormData : l'absence vaut « éteint ».
     D'où la boucle sur la liste connue plutôt que sur ce que le formulaire a
     envoyé — sinon éteindre une fonction ne l'éteindrait jamais. */
  const capabilities = sanitizeCapabilities(
    Object.fromEntries(AI_CAPABILITIES.map((cap) => [cap, formData.get(`cap.${cap}`) === "on"])),
  );

  const sources = {
    kb: formData.get("source.kb") === "on",
    macros: formData.get("source.macros") === "on",
    resolvedTickets: formData.get("source.resolvedTickets") === "on",
    internalNotes: formData.get("source.internalNotes") === "on",
  };
  const before = await getAiSettings(tenant.id);

  await saveAiSettings(tenant.id, {
    enabled: formData.get("enabled") === "on",
    capabilities,
    sources,
    deflectionLocales: sanitizeLocales(
      formData.getAll("locale").map((l) => String(l)),
      LOCALES.map((l) => l.code),
    ),
    deflectionThreshold: Number(formData.get("threshold") ?? 70),
  });

  /* Couper une source doit retirer ce qu'elle avait indexé, tout de suite.
     `reindexWorkspace` est ce qui supprime le devenu-interdit ; sans cet appel
     l'interrupteur ne changerait rien à ce que l'assistant lit avant le
     passage du worker, six heures plus tard — et l'écran mentirait.

     Au mieux : une réindexation qui échoue ne doit pas perdre l'enregistrement
     de l'admin. Le balayage périodique rattrapera. */
  if (changed(before.sources, sources)) {
    try {
      const provider = await providerFor(tenant.id, decryptSecret);
      if (provider?.embedModel) {
        await reindexWorkspace(provider, tenant.id, sources, {
          kind: "agent",
          userId: agent.id,
          name: agent.name,
        });
      }
    } catch {
      /* rien : l'enregistrement compte plus que l'index */
    }
  }

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

function changed(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  return Object.keys(b).some((k) => a[k] !== b[k]);
}

/**
 * Réindexe maintenant, et dit combien.
 *
 * Le balayage du worker passe toutes les six heures ; ce bouton existe parce
 * qu'un admin qui vient de couper « tickets résolus » veut voir les documents
 * disparaître tout de suite — c'est `reindexWorkspace` qui supprime ce que
 * l'espace vient d'interdire, donc sans lui l'interrupteur ne changerait rien
 * à ce que l'assistant lit avant six heures.
 */
export async function reindexKnowledge() {
  const { tenant, agent } = await requireManager();
  const provider = await providerFor(tenant.id, decryptSecret);
  if (!provider?.embedModel) redirect(`${PATH}?error=index`);

  const settings = await getAiSettings(tenant.id);
  try {
    const out = await reindexWorkspace(provider, tenant.id, settings.sources, {
      kind: "agent",
      userId: agent.id,
      name: agent.name,
    });
    revalidatePath(PATH);
    redirect(`${PATH}?indexed=${out.indexed}&removed=${out.removed}`);
  } catch (err) {
    /* redirect() lève : la relancer, sinon le catch avale la navigation. */
    if (err && typeof err === "object" && "digest" in err) throw err;
    redirect(`${PATH}?error=index`);
  }
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
