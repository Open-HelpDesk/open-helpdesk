import { afterEach, describe, expect, it, vi } from "vitest";
import { byoProvider, chatComplete, parseJson, type ProviderConfig } from "./provider";

/**
 * Ce que le produit fait de la réponse du fournisseur.
 *
 * Le réseau est simulé — l'appel réel est vérifié par `live.mts`, contre
 * Scaleway. Ce qui est éprouvé ici est la lecture de la réponse, et chaque cas
 * vient d'un comportement observé sur le vrai modèle, pas d'une hypothèse :
 *
 *  · un modèle à raisonnement rend `content: null` et remplit `reasoning`
 *    tant que sa réflexion n'est pas finie ;
 *  · au plafond de jetons, il rend un contenu vide avec
 *    `finish_reason: "length"` — une réponse coupée, pas une réponse vide ;
 *  · `content` arrive parfois en tableau de fragments plutôt qu'en chaîne.
 *
 * Le premier de ces cas a écrit un brouillon vide dans le composeur d'un agent
 * avant qu'on ne le trouve.
 */
const provider: ProviderConfig = {
  base: "https://exemple.test/v1",
  apiKey: "clé",
  model: "gemma-4-26b-a4b-it",
  embedModel: "qwen3-embedding-8b",
  label: "test",
  byo: false,
};

/** Répond une fois, et retient ce qui a été envoyé. */
function stubFetch(payload: unknown, ok = true) {
  const sent: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: { body?: string }) => {
    sent.push(init?.body ?? "");
    return { ok, status: ok ? 200 : 500, json: async () => payload };
  });
  return sent;
}

/** Le corps JSON de la requête partie — ce que le produit a demandé au modèle. */
const body = (sent: string[]) => JSON.parse(sent[0] ?? "{}") as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chatComplete", () => {
  it("returns the text, the tokens and the cost", async () => {
    stubFetch({
      model: "gemma-4-26b-a4b-it",
      choices: [{ finish_reason: "stop", message: { content: "  Bonjour Marie  " } }],
      usage: { prompt_tokens: 800, completion_tokens: 60 },
    });
    const out = await chatComplete(provider, { messages: [{ role: "user", content: "x" }] });
    expect(out.text).toBe("Bonjour Marie");
    expect(out.inputTokens).toBe(800);
    expect(out.outputTokens).toBe(60);
    expect(out.costMicros).toBe(230);
  });

  it("throws rather than return an empty draft when the answer was cut at the ceiling", async () => {
    // The defect this pins: returned as "", the capability logged a success and
    // the composer received a blank draft with nothing to explain it.
    stubFetch({
      choices: [{ finish_reason: "length", message: { content: "", reasoning: "…" } }],
      usage: { prompt_tokens: 400, completion_tokens: 500 },
    });
    await expect(
      chatComplete(provider, { messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow("ai_truncated");
  });

  it("accepts an empty answer that was not cut", async () => {
    // Same emptiness, different cause: the model simply had nothing to say, and
    // the capability turns that into a refusal of its own.
    stubFetch({
      choices: [{ finish_reason: "stop", message: { content: "" } }],
      usage: { prompt_tokens: 10, completion_tokens: 0 },
    });
    const out = await chatComplete(provider, { messages: [{ role: "user", content: "x" }] });
    expect(out.text).toBe("");
  });

  it("joins a content delivered as fragments", async () => {
    stubFetch({
      choices: [{ finish_reason: "stop", message: { content: [{ text: "Bon" }, { text: "jour" }] } }],
      usage: {},
    });
    const out = await chatComplete(provider, { messages: [{ role: "user", content: "x" }] });
    expect(out.text).toBe("Bonjour");
  });

  it("reports how much reasoning was produced — it is billed as output", async () => {
    stubFetch({
      choices: [{ finish_reason: "stop", message: { content: "ok", reasoning: "12345" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const out = await chatComplete(provider, { messages: [{ role: "user", content: "x" }] });
    expect(out.reasoningChars).toBe(5);
  });

  it("switches reasoning off by default, and asks for JSON only when told to", async () => {
    /*
     * Measured, and it is the opposite of what the provider's documentation
     * suggests: with reasoning on, a triage cost 536 output tokens instead of
     * 28, for a worse answer. `json_object` also beat a strict `json_schema` on
     * this model, which is why the schema lives in the prompt.
     */
    let sent = stubFetch({ choices: [{ message: { content: "ok" } }], usage: {} });
    await chatComplete(provider, { messages: [{ role: "user", content: "x" }] });
    expect(body(sent).reasoning_effort).toBe("none");
    expect(body(sent).response_format).toBeUndefined();
    expect(body(sent).max_tokens).toBe(1200);

    vi.unstubAllGlobals();
    sent = stubFetch({ choices: [{ message: { content: "{}" } }], usage: {} });
    await chatComplete(provider, {
      messages: [{ role: "user", content: "x" }],
      json: true,
      reasoning: true,
      maxTokens: 400,
    });
    expect(body(sent).reasoning_effort).toBeUndefined();
    expect(body(sent).response_format).toEqual({ type: "json_object" });
    expect(body(sent).max_tokens).toBe(400);
    // Lower still for JSON: a stray comma costs the whole answer.
    expect(body(sent).temperature).toBe(0.1);
  });

  it("charges nothing for a model the workspace brought itself", async () => {
    // They pay their own inference, so we do not pretend to price it — a
    // non-zero figure on the usage screen would be an invented bill.
    stubFetch({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 6000, completion_tokens: 400 },
    });
    const own = byoProvider({ endpoint: "https://llm.client.test/v1/", model: "gemma-4-26b-a4b-it", secret: null });
    const out = await chatComplete(own, { messages: [{ role: "user", content: "x" }] });
    expect(out.costMicros).toBe(0);
    // And the trailing slash is dropped, or the URL would carry a double one.
    expect(own.base).toBe("https://llm.client.test/v1");
  });

  it("raises the HTTP status rather than swallow it", async () => {
    stubFetch({}, false);
    await expect(
      chatComplete(provider, { messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow("ai_http_500");
  });
});

describe("parseJson", () => {
  it("reads a bare object", () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("survives a fenced block and chatter around it", () => {
    // Models wrap JSON in ``` and introduce it, whatever the prompt says.
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Voici le résultat : {"a":1} — voilà.')).toEqual({ a: 1 });
  });

  it("returns null on anything unparseable, rather than throwing inside a capability", () => {
    expect(parseJson("pas du json")).toBeNull();
    expect(parseJson('{"a":')).toBeNull();
    expect(parseJson("")).toBeNull();
  });
});
