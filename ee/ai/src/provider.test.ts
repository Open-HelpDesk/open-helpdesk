import { describe, expect, it } from "vitest";
import { costMicros } from "./provider";

/**
 * L'arithmétique du coût, en millionièmes d'euro.
 *
 * Les chiffres attendus viennent de la grille Scaleway relevée le 8 septembre
 * 2026 et des tailles d'appel réellement mesurées sur le workspace de
 * démonstration. Ils sont écrits en dur exprès : si la grille change, ce test
 * doit échouer et forcer à mettre à jour les deux endroits ensemble — le prix
 * du produit se calcule là-dessus.
 */
describe("costMicros", () => {
  const CHAT = "gemma-4-26b-a4b-it";

  it.each([
    ["triage", CHAT, 800, 60, 230],
    ["thread summary", CHAT, 3000, 250, 875],
    ["reply draft from the knowledge base", CHAT, 6000, 400, 1700],
    ["customer-facing deflection", CHAT, 6000, 300, 1650],
    ["embedding", "qwen3-embedding-8b", 1500, 0, 150],
  ])("%s: %s %d in / %d out = %d µ€", (_label, model, input, output, expected) => {
    expect(costMicros(model, input, output)).toBe(expected);
  });

  it("charges nothing for a model absent from the grid, rather than failing", () => {
    // A model we do not price must not break the call: it is logged at zero,
    // which shows up immediately on the usage screen as a row that costs
    // nothing — visible, unlike an exception swallowed in a worker.
    expect(costMicros("inexistant", 9999, 9999)).toBe(0);
  });
});
