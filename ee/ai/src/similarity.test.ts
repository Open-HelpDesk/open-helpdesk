import { describe, expect, it } from "vitest";
import { cosine } from "./similarity";

/**
 * Le cosinus dont dépend le plancher de la couche de connaissance.
 *
 * Quatorze lignes, et tout le comportement de l'assistant s'appuie dessus : le
 * plancher de 0,62 sépare « cet article répond » de « cet article parle
 * d'autre chose », et il a été calibré sur des scores que cette fonction
 * produit. Une erreur ici ne lèverait rien — elle changerait silencieusement ce
 * que l'assistant accepte comme source.
 */
describe("cosine", () => {
  it("is 1 for a vector against itself, whatever its scale", () => {
    // Not normalised: the same direction scaled by ten must still be a perfect
    // match, or a longer article would score lower than a short one on the
    // same subject.
    const v = [0.2, -0.5, 0.9, 0.1];
    expect(cosine(v, v)).toBeCloseTo(1, 12);
    expect(cosine(v, v.map((x) => x * 10))).toBeCloseTo(1, 12);
  });

  it("is 0 for orthogonal vectors and -1 for opposites", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 2], [-1, -2])).toBeCloseTo(-1, 12);
  });

  it("is 0 rather than NaN when a vector is empty or all zeros", () => {
    /*
     * The case that matters in production. A document whose embedding failed is
     * stored with an empty vector, and a zero vector divides by zero. Returning
     * NaN would be worse than useless: `NaN >= FLOOR` is false, so it would
     * happen to filter correctly — until someone sorted on the score and got an
     * unstable order, or displayed it.
     */
    expect(cosine([], [1, 2])).toBe(0);
    expect(cosine([1, 2], [])).toBe(0);
    expect(cosine([0, 0], [1, 2])).toBe(0);
    expect(Number.isNaN(cosine([0, 0], [0, 0]))).toBe(false);
  });

  it("compares over the shorter length when the dimensions differ", () => {
    // Two embedding models produce different dimensions. Truncating is a choice
    // that keeps a mixed index usable instead of throwing; it is pinned here so
    // that switching models is a deliberate act rather than a surprise.
    expect(cosine([1, 0, 0], [1, 0])).toBeCloseTo(1, 12);
  });
});
