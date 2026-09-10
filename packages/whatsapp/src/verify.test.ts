import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { challengeResponse, verifySignature } from "./verify";

/**
 * La vérification du webhook entrant.
 *
 * C'est la seule barrière entre l'internet et une passerelle d'envoi WhatsApp :
 * un webhook non vérifié laisse n'importe qui écrire dans le fil d'un client et,
 * par le chemin sortant, envoyer des messages en votre nom. Les cas ci-dessous
 * couvrent donc les refus autant que l'acceptation — c'est un refus manquant
 * qui ouvre la porte, pas une acceptation manquante.
 */

const SECRET = "app-secret-de-test";
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

describe("verifySignature", () => {
  it("accepts a body signed with the app secret", () => {
    const body = '{"object":"whatsapp_business_account"}';
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("refuses a body that changed by one character", () => {
    const body = '{"object":"whatsapp_business_account"}';
    const header = sign(body);
    expect(verifySignature(`${body} `, header, SECRET)).toBe(false);
  });

  it("refuses a signature made with another secret", () => {
    const body = "{}";
    expect(verifySignature(body, sign(body, "autre-secret"), SECRET)).toBe(false);
  });

  it("refuses a missing or empty header", () => {
    expect(verifySignature("{}", null, SECRET)).toBe(false);
    expect(verifySignature("{}", undefined, SECRET)).toBe(false);
    expect(verifySignature("{}", "", SECRET)).toBe(false);
  });

  it("refuses a header without the sha256= prefix", () => {
    const raw = createHmac("sha256", SECRET).update("{}", "utf8").digest("hex");
    // La valeur est juste, le format non : on refuse quand même. Accepter les
    // deux formes reviendrait à accepter une forme que Meta n'envoie jamais.
    expect(verifySignature("{}", raw, SECRET)).toBe(false);
    expect(verifySignature("{}", `sha1=${raw}`, SECRET)).toBe(false);
  });

  it("refuses a malformed hex instead of throwing", () => {
    /*
     * Le cas qui compte pour la disponibilité : `timingSafeEqual` lève sur des
     * tampons de longueurs différentes. Sans le contrôle de longueur et de
     * format, un en-tête bricolé rendrait un 500 au lieu d'un refus propre —
     * donc un moyen de faire du bruit dans les journaux à volonté.
     */
    expect(verifySignature("{}", "sha256=pas-du-hex", SECRET)).toBe(false);
    expect(verifySignature("{}", "sha256=abcd", SECRET)).toBe(false);
    expect(verifySignature("{}", `sha256=${"a".repeat(128)}`, SECRET)).toBe(false);
  });

  it("refuses everything when the secret is missing", () => {
    // Un canal mal configuré ne doit pas devenir un canal ouvert.
    const body = "{}";
    expect(verifySignature(body, sign(body, ""), "")).toBe(false);
  });

  it("accepts an uppercase hex, since hex has no case", () => {
    const body = '{"a":1}';
    const [, hex] = sign(body).split("=");
    // Seul l'hexadécimal est mis en capitales. Mettre TOUT l'en-tête en
    // capitales — l'erreur de la première version de ce test — change aussi le
    // préfixe, et le préfixe fait partie du format : Meta envoie « sha256= »,
    // en minuscules, et une implémentation permissive sur le format accepterait
    // une forme qui n'existe pas.
    expect(verifySignature(body, `sha256=${hex!.toUpperCase()}`, SECRET)).toBe(true);
  });

  it("signs the bytes and not the parsed object", () => {
    /*
     * Deux corps équivalents en JSON, différents en octets. La signature de
     * l'un ne doit pas valider l'autre : c'est ce qui interdit de reparser puis
     * re-sérialiser avant de vérifier, et c'est l'erreur la plus fréquente sur
     * ce genre de webhook — elle ressemble à un mauvais secret.
     */
    const a = '{"x":1,"y":2}';
    const b = '{"y":2,"x":1}';
    expect(verifySignature(b, sign(a), SECRET)).toBe(false);
  });
});

describe("challengeResponse", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);

  it("echoes the challenge when the token matches", () => {
    const p = params({
      "hub.mode": "subscribe",
      "hub.verify_token": "jeton",
      "hub.challenge": "1158201444",
    });
    expect(challengeResponse(p, "jeton")).toBe("1158201444");
  });

  it("refuses a wrong token", () => {
    const p = params({ "hub.mode": "subscribe", "hub.verify_token": "faux", "hub.challenge": "x" });
    expect(challengeResponse(p, "jeton")).toBeNull();
  });

  it("refuses a token of another length without comparing", () => {
    // Le contrôle de longueur évite que timingSafeEqual lève ; le refus doit
    // rester un refus et pas une exception.
    const p = params({ "hub.mode": "subscribe", "hub.verify_token": "j", "hub.challenge": "x" });
    expect(challengeResponse(p, "jeton-beaucoup-plus-long")).toBeNull();
  });

  it("refuses a mode other than subscribe", () => {
    const p = params({ "hub.mode": "unsubscribe", "hub.verify_token": "jeton", "hub.challenge": "x" });
    expect(challengeResponse(p, "jeton")).toBeNull();
  });

  it("refuses when the challenge is missing", () => {
    const p = params({ "hub.mode": "subscribe", "hub.verify_token": "jeton" });
    expect(challengeResponse(p, "jeton")).toBeNull();
  });

  it("refuses when no token is configured", () => {
    const p = params({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "x" });
    expect(challengeResponse(p, "")).toBeNull();
  });
});
