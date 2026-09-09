import { describe, expect, it } from "vitest";
import { domainOfAddress, parseAddress } from "./address";

/**
 * Le découpage d'adresses, qui remplace trois regex signalées en
 * `js/polynomial-redos`.
 *
 * Trois appelants en dépendent maintenant — le domaine d'un expéditeur, la
 * lecture d'un en-tête `From:` entrant, et la mise en forme pour Brevo. Les cas
 * ci-dessous fixent le comportement des trois anciennes implémentations, parce
 * qu'un correctif de sécurité qui change silencieusement l'analyse des adresses
 * casserait la réception d'emails, et personne ne relierait les deux.
 */
describe("parseAddress", () => {
  it("splits a display name from the address", () => {
    expect(parseAddress("Support <a@b.fr>")).toEqual({ email: "a@b.fr", name: "Support" });
  });

  it("accepts a bare address", () => {
    expect(parseAddress("a@b.fr")).toEqual({ email: "a@b.fr" });
    expect(parseAddress("  a@b.fr  ")).toEqual({ email: "a@b.fr" });
  });

  it("strips one enclosing pair of quotes, and only one", () => {
    expect(parseAddress('"Support Acme" <a@b.fr>')).toEqual({
      email: "a@b.fr",
      name: "Support Acme",
    });
    // Quotes inside a name are part of the name: `Jean "Jef" Dupont` is how
    // some people write their nickname, and eating them would rename them.
    expect(parseAddress('Jean "Jef" Dupont <a@b.fr>')).toEqual({
      email: "a@b.fr",
      name: 'Jean "Jef" Dupont',
    });
  });

  it("gives no name rather than an empty one", () => {
    expect(parseAddress("<a@b.fr>")).toEqual({ email: "a@b.fr" });
    expect(parseAddress('"" <a@b.fr>')).toEqual({ email: "a@b.fr" });
  });

  it("takes the last angle bracket when a name contains one", () => {
    // A display name carrying a "<" is malformed but arrives: the address is
    // what sits in the final pair, not in the first one found.
    expect(parseAddress("a<b <c@d.fr>")).toEqual({ email: "c@d.fr", name: "a<b" });
  });

  it("returns the trimmed input when the bracket is never closed", () => {
    // The exact shape that made the old regexes quadratic. Here it is linear
    // and it answers something usable rather than throwing.
    expect(parseAddress("Support <a@b.fr")).toEqual({ email: "Support <a@b.fr" });
  });

  it("stays fast on the pathological input, and answers", () => {
    /*
     * The ReDoS itself. `"<".repeat(200000)` against `/<([^>]+)>/` made the
     * engine retry from every position; here the work is two index scans.
     *
     * The assertion is on the time budget deliberately: a future rewrite that
     * reintroduces a backtracking regex would pass every case above and fail
     * only this one.
     */
    const hostile = "<".repeat(200_000);
    const started = Date.now();
    expect(parseAddress(hostile).email.length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it("does not look past a sane length", () => {
    // 1024 characters is already far more than an address plus a name; beyond
    // that the input is not an address, so we do not hunt through it.
    const long = `${"x".repeat(5000)} <a@b.fr>`;
    expect(parseAddress(long).email).not.toBe("a@b.fr");
  });
});

describe("domainOfAddress", () => {
  it("lowercases the domain, with or without a display name", () => {
    expect(domainOfAddress("Support <A@B.FR>")).toBe("b.fr");
    expect(domainOfAddress("a@B.Fr")).toBe("b.fr");
  });

  it("takes the domain after the last @", () => {
    // A quoted local part may contain an @. Splitting on the first one would
    // hand back a domain that is really part of the mailbox name.
    expect(domainOfAddress('"a@b"@c.fr')).toBe("c.fr");
  });

  it("is empty when there is no @ at all", () => {
    expect(domainOfAddress("pas-une-adresse")).toBe("");
  });
});
