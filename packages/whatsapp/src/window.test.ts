import { describe, expect, it } from "vitest";
import { SERVICE_WINDOW_MS, closedWindowPlan, serviceWindow } from "./window";

/**
 * La fenêtre de 24 heures.
 *
 * Ces cas fixent une règle métier, pas une arithmétique : hors fenêtre, un
 * message libre est refusé par Meta, et l'agent doit l'apprendre AVANT
 * d'écrire. Un défaut ici ne casse rien visiblement — il laisse simplement un
 * agent croire qu'il a répondu.
 */

const AT = new Date("2026-09-10T12:00:00.000Z");

describe("serviceWindow", () => {
  it("is open just after the customer wrote", () => {
    const w = serviceWindow(AT, new Date(AT.getTime() + 60_000));
    expect(w.open).toBe(true);
    expect(w.remainingMs).toBe(SERVICE_WINDOW_MS - 60_000);
    expect(w.closesAt?.toISOString()).toBe("2026-09-11T12:00:00.000Z");
  });

  it("is closed one millisecond after the deadline", () => {
    const w = serviceWindow(AT, new Date(AT.getTime() + SERVICE_WINDOW_MS + 1));
    expect(w.open).toBe(false);
    expect(w.remainingMs).toBe(0);
  });

  it("is closed exactly at the deadline", () => {
    /*
     * Le bord choisi, et il est délibéré : à exactement 24 h, on considère la
     * fenêtre fermée. Se tromper dans ce sens fait perdre un envoi ; se tromper
     * dans l'autre fait croire à un agent qu'il peut écrire alors que Meta
     * refusera. La deuxième erreur coûte plus cher.
     */
    const w = serviceWindow(AT, new Date(AT.getTime() + SERVICE_WINDOW_MS));
    expect(w.open).toBe(false);
  });

  it("distinguishes never-opened from closed", () => {
    // Deux états différents à l'écran : il n'y a rien à rouvrir, versus
    // quelque chose s'est fermé. `closesAt` est ce qui les sépare.
    const never = serviceWindow(null, AT);
    expect(never.open).toBe(false);
    expect(never.closesAt).toBeNull();

    const closed = serviceWindow(AT, new Date(AT.getTime() + SERVICE_WINDOW_MS * 2));
    expect(closed.open).toBe(false);
    expect(closed.closesAt).not.toBeNull();
  });

  it("treats undefined like null", () => {
    // Le champ vient d'une colonne nullable lue par drizzle : selon le chemin,
    // l'absence arrive en null ou en undefined.
    expect(serviceWindow(undefined, AT).open).toBe(false);
  });

  it("does not extend on our own reply", () => {
    /*
     * La propriété la plus contre-intuitive du mécanisme, et celle que ce test
     * existe pour figer : seul un message ENTRANT ouvre la fenêtre. La fonction
     * ne prend donc qu'un instant, celui du dernier message du client — s'y
     * glissait un jour la date d'une réponse d'agent, la fenêtre paraîtrait
     * ouverte alors que Meta refuserait.
     */
    const lastInbound = AT;
    const ourReplyLater = new Date(AT.getTime() + SERVICE_WINDOW_MS - 1000);
    const w = serviceWindow(lastInbound, new Date(ourReplyLater.getTime() + 2000));
    expect(w.open).toBe(false);
  });
});

/**
 * The closed-window decision — what an agent is told, and what the customer
 * receives.
 *
 * Three outcomes and not two. Before templates there was only "refused", and
 * that answer left the agent with no move: they could not reach the customer,
 * and the reply they had written stayed unsent until someone noticed. The
 * customer, waiting, had no reason to write. These tests pin the difference.
 */
describe("closedWindowPlan", () => {
  const template = { templateName: "ticket_update", templateLang: "fr" };

  it("garde la réponse et relance le client la première fois", () => {
    expect(closedWindowPlan({ ...template, alreadyPrompted: false })).toBe("queue_and_prompt");
  });

  /**
   * Une seule relance par silence. Un gabarit est facturé à l'envoi, et quatre
   * notifications pour un seul fil sans réponse est la façon la plus sûre de
   * faire couper le canal par la personne qu'il devait atteindre.
   */
  it("garde la réponse sans relancer deux fois", () => {
    expect(closedWindowPlan({ ...template, alreadyPrompted: true })).toBe("queue_only");
  });

  it("refuse quand aucun gabarit n'est configuré", () => {
    expect(
      closedWindowPlan({ templateName: null, templateLang: null, alreadyPrompted: false }),
    ).toBe("refuse");
  });

  /**
   * Et refuse aussi sur une configuration à moitié remplie. Meta rejette un
   * nom sans code de langue, et un code sans nom ne désigne aucun gabarit :
   * accepter la moitié produirait un canal qui promet de rouvrir la
   * conversation et échoue au moment de le faire.
   */
  it("refuse une configuration à moitié remplie", () => {
    expect(
      closedWindowPlan({ templateName: "ticket_update", templateLang: null, alreadyPrompted: false }),
    ).toBe("refuse");
    expect(
      closedWindowPlan({ templateName: null, templateLang: "fr", alreadyPrompted: false }),
    ).toBe("refuse");
    expect(
      closedWindowPlan({ templateName: "", templateLang: "fr", alreadyPrompted: false }),
    ).toBe("refuse");
  });

  it("refuse même si le client a déjà été relancé, faute de gabarit", () => {
    // L'ordre des conditions compte : sans gabarit il n'y a rien à envoyer,
    // que le client ait été relancé ou non.
    expect(
      closedWindowPlan({ templateName: null, templateLang: null, alreadyPrompted: true }),
    ).toBe("refuse");
  });
});
