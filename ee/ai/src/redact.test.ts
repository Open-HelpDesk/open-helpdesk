import { describe, expect, it } from "vitest";
import { redact } from "./redact";

/**
 * La rédaction : ce qui ne doit pas quitter l'instance.
 *
 * Chaque cas ici vient d'un vrai faux positif ou d'un vrai oubli, trouvés en
 * écrivant la fonction. Les deux qui comptent le plus sont ceux qui échouaient :
 * un mot de passe annoncé en français, parce que la première liste de mots était
 * anglaise sur un produit qui parle 25 langues ; et un numéro de commande à
 * seize chiffres masqué comme une carte, parce qu'il échouait le contrôle de
 * Luhn puis retombait sur la règle du téléphone.
 */
describe("redact", () => {
  it("masks an API key and a password, in French too", () => {
    const out = redact("Ma clé est ohd_live_abcdef1234567890 et mon mot de passe: hunter2");
    expect(out.text).toContain("[secret]");
    expect(out.text).toContain("[redacted]");
  });

  it("masks a real card and leaves a 16-digit order number alone", () => {
    const out = redact("Ma carte 4242 4242 4242 4242 a été refusée, commande 1234567890123456");
    expect(out.text).toContain("[card]");
    // Luhn distinguishes the two. Without it, every long reference became a card.
    expect(out.text).toContain("1234567890123456");
  });

  it("masks an email and an IP address by default", () => {
    const out = redact("Je n'arrive pas à me connecter avec julien@nordfil.fr, ni depuis 192.168.1.4");
    expect(out.text).toContain("[email]");
    expect(out.text).toContain("[ip]");
  });

  it("lets the thread's own address through, and counts no redaction for it", () => {
    // The requester's address is the one the model needs in order to write to
    // them. Masking it would make every draft address "[email]".
    const out = redact("Je n'arrive pas à me connecter avec julien@nordfil.fr", [
      "julien@nordfil.fr",
    ]);
    expect(out.text).toContain("julien@nordfil.fr");
    expect(out.counts.email ?? 0).toBe(0);
  });

  it("masks a phone number and leaves a short reference alone", () => {
    const out = redact("Appelez-moi au +33 6 12 34 56 78, référence 12345");
    expect(out.text).toContain("[phone]");
    expect(out.text).toContain("12345");
  });

  it("counts what it masked, by type", () => {
    // The count is what the call log stores: the proof, not the promise.
    const out = redact("a@b.fr, c@d.fr et 10.0.0.1");
    expect(out.counts).toMatchObject({ email: 2, ip: 1 });
  });
});
