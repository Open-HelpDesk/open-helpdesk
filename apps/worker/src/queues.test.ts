import { describe, expect, it } from "vitest";
import { QUEUE_NAMES, SWEEP_JOB_OPTS } from "./queues";

/**
 * La politique de reprise des balayages périodiques.
 *
 * Ces assertions n'existent pas pour vérifier que des constantes valent ce
 * qu'elles valent : elles existent parce que le défaut qu'elles empêchent a
 * déjà eu lieu, et qu'il est invisible. Un `ai-sweep` a échoué pendant la
 * recréation des conteneurs d'un déploiement, sans reprise, et il est resté
 * dans `failed` — allumant l'alerte `QueueJobsFailing` pour de bon. Rien dans
 * le code ne signalait l'absence de politique de reprise : c'était le défaut
 * de BullMQ.
 *
 * Le risque n'est donc pas qu'on écrive `attempts: 1` volontairement, c'est
 * qu'un remaniement passe le gabarit à côté du planificateur et que tout
 * reparte en une seule tentative sans qu'aucun test ne bronche.
 */
describe("SWEEP_JOB_OPTS", () => {
  it("retries more than once", () => {
    // Le cœur du sujet. Une seule tentative = une coupure de déploiement
    // devient une alerte permanente.
    expect(SWEEP_JOB_OPTS.attempts).toBeGreaterThan(1);
  });

  it("tolerates longer than a deploy takes to come back", () => {
    /*
     * Un backoff exponentiel de `delay` sur n tentatives attend
     * delay × (2⁰ + … + 2ⁿ⁻²) avant d'abandonner. On veut que cette fenêtre
     * dépasse la durée pendant laquelle Postgres et Redis sont indisponibles
     * lors d'un `deploy-staging.sh` — mesuré autour de deux minutes, on exige
     * cinq pour garder de la marge.
     *
     * L'assertion porte sur la fenêtre et non sur `attempts`, parce que c'est
     * la fenêtre qui compte : passer à 3 tentatives avec un délai plus long
     * resterait acceptable, à 5 tentatives avec un délai de 100 ms non.
     */
    const { attempts, backoff } = SWEEP_JOB_OPTS;
    const window = backoff.delay * (2 ** (attempts - 1) - 1);
    expect(window).toBeGreaterThan(5 * 60_000);
  });

  it("bounds the completed set", () => {
    // `sla-timers` seul ajoute 1 440 entrées par jour. Sans borne, Redis
    // grossit aussi longtemps que le worker tourne, et une file qui marche
    // ressemble exactement à une file qui fuit.
    expect(SWEEP_JOB_OPTS.removeOnComplete.count).toBeGreaterThan(0);
    expect(SWEEP_JOB_OPTS.removeOnComplete.count).toBeLessThanOrEqual(1000);
  });

  it("never removes failures automatically", () => {
    /*
     * Le point le plus facile à casser en croyant bien faire : borner les
     * échecs comme on borne les succès ferait taire l'alerte au lieu d'y
     * répondre. `redis_key_size{key=~"bull:*:failed"}` est la source de
     * l'objectif O-3 — les échecs *sont* la mesure.
     */
    expect(SWEEP_JOB_OPTS).not.toHaveProperty("removeOnFail");
  });
});

describe("QUEUE_NAMES", () => {
  it("has no duplicate, because a duplicate silently doubles its workers", () => {
    // Le worker construit un `Worker` par nom : un doublon donnerait deux
    // consommateurs concurrents sur la même file, et une exécution double des
    // balayages plutôt qu'une erreur.
    expect(new Set(QUEUE_NAMES).size).toBe(QUEUE_NAMES.length);
  });
});
