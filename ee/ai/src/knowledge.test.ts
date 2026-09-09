import { describe, expect, it } from "vitest";
import { plain } from "./knowledge";

/**
 * Le décapage HTML de la couche de connaissance.
 *
 * Ce que le modèle lit vient d'ici : une déformation à cette étape se retrouve
 * citée dans une réponse au client, avec une source à l'appui — donc avec l'air
 * d'être vérifiée.
 */
describe("plain", () => {
  it("turns breaks and block ends into newlines", () => {
    expect(plain("un<br>deux<br/>trois")).toBe("un\ndeux\ntrois");
    /*
     * Une espace subsiste après le saut : la balise ouvrante `<p>` devient une
     * espace, comme toute balise restante. C'est le comportement réel, pinné
     * tel quel et **pas corrigé** — le plancher de similarité de 0,62 a été
     * calibré sur cette sortie exacte, donc « nettoyer » le texte indexé
     * déplacerait tous les embeddings et invaliderait la mesure. Un ménage
     * cosmétique appartient au lot qui recalibrera (IA-6), pas à un correctif
     * de sécurité.
     */
    expect(plain("<p>un</p><p>deux</p>")).toBe("un\n deux");
  });

  it("decodes entities in one pass", () => {
    /*
     * Le cas qui a motivé le correctif. En chaînant les remplacements, le `&`
     * décodé depuis `&amp;` était relu au tour suivant et `&amp;lt;` devenait
     * `<`. Un article qui documente des entités HTML — il y en a, c'est un
     * produit de support technique — voyait ses exemples réécrits.
     */
    expect(plain("Écrire &amp;lt; pour afficher &lt;")).toBe("Écrire &lt; pour afficher <");
    expect(plain("&amp;amp;")).toBe("&amp;");
  });

  it("leaves an entity it does not know alone", () => {
    expect(plain("&eacute; reste tel quel")).toBe("&eacute; reste tel quel");
  });

  it("collapses runs of spaces and blank lines", () => {
    expect(plain("<p>un</p>\n\n\n\n<p>deux</p>")).toBe("un\n\n deux");
    expect(plain("a&nbsp;&nbsp;&nbsp;b")).toBe("a b");
  });

  it("answers on empty input", () => {
    expect(plain(null)).toBe("");
    expect(plain("")).toBe("");
  });
});
