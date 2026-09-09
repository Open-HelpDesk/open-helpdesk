/**
 * Découpage d'une adresse email en nom d'affichage et adresse, **sans
 * expression régulière**.
 *
 * Les trois endroits qui le faisaient à la main utilisaient chacun une regex
 * de la forme `<([^>]+)>` ou `^\s*(.*?)\s*<([^>]+)>\s*$`, et CodeQL les a
 * signalées toutes les trois en `js/polynomial-redos` : sur une entrée qui ne
 * referme jamais son chevron, le moteur reprend son essai à chaque position et
 * le coût devient quadratique. Ce n'est pas théorique ici — ces fonctions
 * lisent des en-têtes `From:` d'emails entrants, donc du texte qu'un tiers
 * choisit.
 *
 * Deux garde-fous, et le second seul ne suffirait pas :
 *
 *   1. Une borne de longueur. Une adresse valide fait au plus 254 caractères
 *      (RFC 5321) ; avec un nom d'affichage on tolère large, mais pas
 *      illimité. Au-delà, on ne cherche pas : l'entrée n'est pas une adresse.
 *   2. Un parcours par index. `indexOf` et `lastIndexOf` sont linéaires et ne
 *      reviennent jamais en arrière, donc la question du backtracking ne se
 *      pose plus du tout — plutôt que de rendre une regex « assez » sûre et
 *      d'espérer que la prochaine réécriture le reste.
 */

/** Au-delà, ce n'est pas une adresse : 254 pour l'adresse, le reste pour le nom. */
const MAX_LENGTH = 1024;

export type ParsedAddress = {
  /** L'adresse seule, sans chevrons ni nom. Jamais vide en sortie de parse. */
  email: string;
  /** Le nom d'affichage, guillemets retirés, ou undefined s'il n'y en a pas. */
  name?: string;
};

/**
 * « Support <a@b.fr> » → `{ email: "a@b.fr", name: "Support" }`.
 * « a@b.fr » → `{ email: "a@b.fr" }`.
 *
 * Ne valide pas l'adresse : ce n'est pas son travail, et chaque appelant a sa
 * propre exigence (l'un veut un domaine, l'autre un `@`). Rend la chaîne
 * d'origine ébarbée quand il n'y a pas de chevrons.
 */
export function parseAddress(value: string): ParsedAddress {
  const raw = value.length > MAX_LENGTH ? value.slice(0, MAX_LENGTH) : value;

  const open = raw.lastIndexOf("<");
  const close = open === -1 ? -1 : raw.indexOf(">", open + 1);
  if (open === -1 || close === -1) return { email: raw.trim() };

  const email = raw.slice(open + 1, close).trim();
  // Le nom est ce qui précède le chevron, débarrassé de ses guillemets. On ne
  // retire qu'une paire encadrante : un nom qui contient des guillemets au
  // milieu les garde, parce qu'ils font partie du nom.
  let name = raw.slice(0, open).trim();
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).trim();
  }
  return { email, name: name || undefined };
}

/** Le domaine d'une adresse, en minuscules : « Support <a@b.fr> » → « b.fr ». */
export function domainOfAddress(value: string): string {
  const { email } = parseAddress(value);
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}
