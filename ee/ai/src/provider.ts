/**
 * Un seul point d'abstraction : un endpoint **compatible OpenAI**. L'instance
 * hébergée pointe sur Scaleway Generative APIs (`fr-par`) ; un espace qui
 * apporte son modèle pointe où il veut, y compris un Ollama ou un vLLM chez
 * lui. Rien dans le produit ne sait lequel, et changer d'endpoint ne change
 * aucun comportement.
 *
 * Même forme que `@openincident/ai` : c'est l'exigence ISO de la spec 18. Ce
 * fichier ne doit diverger de son jumeau que par ce que le support client
 * ajoute — ici, la grille de prix, parce qu'Open HelpDesk vend la résolution
 * et doit connaître son coût de revient.
 */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** De quoi joindre un fournisseur : l'instance, ou le modèle apporté par l'espace. */
export type ProviderConfig = {
  base: string;
  apiKey: string | null;
  model: string;
  embedModel: string | null;
  /** Ce qui s'affiche à l'écran : « Scaleway (fr-par) », ou l'hôte du client. */
  label: string;
  /** Vrai quand l'espace apporte son modèle : ni quota, ni compteur. */
  byo: boolean;
};

/**
 * Le prix du million de jetons, par modèle, en millionièmes d'euro.
 *
 * Dans la configuration et non dans le code : les tarifs bougent, et
 * `ai_calls.cost_micros` en dépend. Un modèle absent de la grille coûte zéro
 * plutôt que de faire échouer l'appel — mais il est journalisé à zéro, ce qui
 * se voit tout de suite sur l'écran de consommation.
 *
 * Valeurs relevées le 8 septembre 2026 sur la page tarifs de Scaleway.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  "gemma-4-26b-a4b-it": { in: 250_000, out: 500_000 },
  "gemma-4-31b-it": { in: 450_000, out: 650_000 },
  "qwen3.5-397b-a17b": { in: 600_000, out: 3_600_000 },
  "qwen3-embedding-8b": { in: 100_000, out: 0 },
};

function priceOf(model: string): { in: number; out: number } {
  return PRICES[model] ?? { in: 0, out: 0 };
}

/** Le coût d'un appel en millionièmes d'euro — un triage vaut ~230. */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceOf(model);
  return Math.round((inputTokens * p.in + outputTokens * p.out) / 1_000_000);
}

/** La configuration de l'instance, ou null quand l'opérateur n'a rien posé. */
export function instanceProvider(): ProviderConfig | null {
  const base = process.env.AI_API_BASE;
  const model = process.env.AI_MODEL;
  if (!base || !model) return null;
  return {
    base: base.replace(/\/$/, ""),
    apiKey: process.env.AI_API_KEY ?? null,
    model,
    embedModel: process.env.AI_EMBED_MODEL ?? null,
    label: process.env.AI_PROVIDER_LABEL ?? hostOf(base),
    byo: false,
  };
}

function hostOf(base: string): string {
  try {
    return new URL(base).host || "—";
  } catch {
    return "—";
  }
}

/** L'espace apporte son modèle (BYO LLM, § 2.2) — le secret est déjà déchiffré. */
export function byoProvider(input: {
  endpoint: string;
  model: string;
  secret: string | null;
  embedModel?: string | null;
}): ProviderConfig {
  return {
    base: input.endpoint.replace(/\/$/, ""),
    apiKey: input.secret,
    model: input.model,
    embedModel: input.embedModel ?? null,
    label: hostOf(input.endpoint),
    byo: true,
  };
}

export type Completion = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
};

function headers(config: ProviderConfig): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) h.authorization = `Bearer ${config.apiKey}`;
  return h;
}

export async function chatComplete(
  config: ProviderConfig,
  opts: {
    messages: ChatMessage[];
    /** Un schéma plutôt qu'un simple mode JSON : la doc de Scaleway dit qu'un
     *  « schemaless JSON mode will produce lower quality results ». */
    schema?: Record<string, unknown>;
    maxTokens?: number;
    temperature?: number;
    model?: string;
  },
): Promise<Completion> {
  const model = opts.model ?? config.model;
  const res = await fetch(`${config.base}/chat/completions`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      model,
      messages: opts.messages,
      /* Bas par défaut, et plus bas encore pour du JSON : la fiabilité du
         format structuré dépend de la température chez ce fournisseur. */
      temperature: opts.temperature ?? (opts.schema ? 0.1 : 0.2),
      max_tokens: opts.maxTokens ?? 900,
      ...(opts.schema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: "out", strict: true, schema: opts.schema },
            },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`ai_http_${res.status}`);
  const data = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content;
  const text =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p) => p.text ?? "").join("") : "";
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const used = data.model ?? model;
  return {
    text: text.trim(),
    model: used,
    inputTokens,
    outputTokens,
    /* Le coût d'un modèle apporté par le client n'est pas le nôtre : il paie
       son inférence, donc on ne prétend pas le chiffrer. */
    costMicros: config.byo ? 0 : costMicros(used, inputTokens, outputTokens),
  };
}

export async function embed(
  config: ProviderConfig,
  texts: string[],
): Promise<{ vectors: number[][]; model: string; tokens: number; costMicros: number }> {
  if (!config.embedModel) throw new Error("ai_embeddings_unconfigured");
  const res = await fetch(`${config.base}/embeddings`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ model: config.embedModel, input: texts }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ai_http_${res.status}`);
  const data = (await res.json()) as {
    model?: string;
    data?: Array<{ embedding: number[]; index?: number }>;
    usage?: { prompt_tokens?: number };
  };
  const vectors = (data.data ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding);
  const tokens = data.usage?.prompt_tokens ?? 0;
  const used = data.model ?? config.embedModel;
  return {
    vectors,
    model: used,
    tokens,
    costMicros: config.byo ? 0 : costMicros(used, tokens, 0),
  };
}

/** Extrait un objet JSON d'une réponse, tolérant aux clôtures et au bavardage autour. */
export function parseJson<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```(?:json)?/m, "")
    .replace(/```$/m, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
