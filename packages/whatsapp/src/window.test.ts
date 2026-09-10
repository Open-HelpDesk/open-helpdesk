import { describe, expect, it } from "vitest";
import { SERVICE_WINDOW_MS, serviceWindow } from "./window";

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
