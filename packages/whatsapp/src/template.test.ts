import { describe, expect, it, vi } from "vitest";
import { sendTemplate } from "./send";
import type { WhatsappConfig } from "./types";

/**
 * The template send — the only message WhatsApp accepts outside 24 hours.
 *
 * These tests cover the payload and the failure paths, not the database: the
 * shape is what Meta validates, and getting it wrong produces an error whose
 * text ("(#132000) Number of parameters does not match") says nothing about
 * which end is wrong.
 */
const config: WhatsappConfig = {
  tenantId: "t1",
  phoneNumberId: "123456789",
  displayPhone: "+33123456789",
  defaultTeamId: null,
  accessToken: "token-abc",
  appSecret: "secret",
  verifyToken: "verify",
};

/*
 * La signature complète sur les mocks, et pas un `vi.fn(async () => …)` nu :
 * sans elle, TypeScript type les appels enregistrés comme un tuple vide, et
 * `calls[0][1]` — l'objet de requête, c'est-à-dire tout ce qu'on veut vérifier
 * — devient inaccessible.
 */
type FetchArgs = [input: string | URL | Request, init?: RequestInit];

const ok = (id = "wamid.OK") =>
  vi.fn(async (..._args: FetchArgs) =>
    new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 }),
  );

describe("sendTemplate — la charge utile", () => {
  it("poste sur le numéro configuré, avec le jeton", async () => {
    const fetchImpl = ok();
    await sendTemplate(config, "33600000000", "ticket_update", "fr", "4821", fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v21.0/123456789/messages");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer token-abc");
  });

  it("déclare le type template, son nom et son code de langue", async () => {
    const fetchImpl = ok();
    await sendTemplate(config, "33600000000", "ticket_update", "en_US", "4821", fetchImpl);

    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("33600000000");
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("ticket_update");
    // `language.code`, et pas `language` en chaîne : Meta refuse la seconde
    // forme avec une erreur qui parle de paramètres, pas de langue.
    expect(body.template.language).toEqual({ code: "en_US" });
  });

  /**
   * La variable positionnelle {{1}} porte le NUMÉRO DE TICKET, et rien d'autre.
   *
   * Ce n'est pas une préférence : le texte d'un gabarit est figé à
   * l'approbation. Y glisser la réponse de l'agent ferait passer du texte
   * arbitraire dans un message approuvé pour une phrase — c'est ainsi qu'un
   * compte perd ses gabarits.
   */
  it("ne passe que le numéro de ticket en variable", async () => {
    const fetchImpl = ok();
    await sendTemplate(config, "33600000000", "ticket_update", "fr", "4821", fetchImpl);

    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "4821" }] },
    ]);
    expect(JSON.stringify(body)).not.toContain("Bonjour");
  });

  it("rend l'identifiant du message envoyé", async () => {
    const result = await sendTemplate(
      config, "33600000000", "ticket_update", "fr", "4821", ok("wamid.XYZ"),
    );
    expect(result).toEqual({ ok: true, wamid: "wamid.XYZ", error: null });
  });
});

describe("sendTemplate — les échecs", () => {
  it("remonte le message d'erreur de Meta tel quel", async () => {
    const fetchImpl = vi.fn(
      async (..._args: FetchArgs) =>
        new Response(
          JSON.stringify({ error: { message: "(#132001) Template name does not exist" } }),
          { status: 400 },
        ),
    );
    const result = await sendTemplate(config, "33600000000", "absent", "fr", "1", fetchImpl);
    // Le texte de Meta et pas le nôtre : c'est lui qui nomme le vrai défaut,
    // et un opérateur le retrouve dans la console.
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Template name does not exist");
  });

  it("rend un code HTTP quand le corps d'erreur est illisible", async () => {
    const fetchImpl = vi.fn(
      async (..._args: FetchArgs) => new Response("<html>502</html>", { status: 502 }),
    );
    const result = await sendTemplate(config, "33600000000", "t", "fr", "1", fetchImpl);
    expect(result).toEqual({ ok: false, wamid: "", error: "HTTP 502" });
  });

  /**
   * Le réseau qui tombe ne doit pas remonter en exception : l'appelant est en
   * train d'enregistrer une réponse d'agent, et une exception ici annulerait
   * l'enregistrement d'un texte que l'agent voit à l'écran.
   */
  it("ne lève pas quand le réseau tombe", async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs): Promise<Response> => {
      throw new Error("ECONNRESET");
    });
    const result = await sendTemplate(config, "33600000000", "t", "fr", "1", fetchImpl);
    expect(result).toEqual({ ok: false, wamid: "", error: "ECONNRESET" });
  });
});
