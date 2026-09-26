/**
 * Bundled brand icons for catalogue applications (spec 19, D-SD7).
 *
 * The glyphs are copied at build time from simple-icons (CC0) into
 * brand-icons.data.ts — only the brands we list, never the whole package, and
 * nothing is ever fetched from a third party. Brands simple-icons had to drop
 * (Slack, Salesforce, Microsoft, Adobe…) are kept with their name and colour
 * only (`path: null`): the tile then shows initials on that colour.
 */
import { BRAND_ICON_DATA } from "./brand-icons.data";

export type BrandIcon = {
  key: string;
  title: string;
  /** Brand colour, `#RRGGBB`. */
  hex: string;
  /** SVG path data, or null when only the colour is bundled. */
  path: string | null;
  /** Defaults to simple-icons' "0 0 24 24". */
  viewBox?: string;
  /** Stroke-drawn glyph (our own mark) instead of a filled path. */
  strokeWidth?: number;
};

/** Our own mark — not a simple-icons brand. */
const OWN: Record<string, Omit<BrandIcon, "key">> = {
  openhelpdesk: {
    title: "Open HelpDesk",
    hex: "#0B5F46",
    path: "M24 8v32M10.1 16l27.8 16M37.9 16L10.1 32",
    viewBox: "0 0 48 48",
    strokeWidth: 8,
  },
};

/** Extra words people type for a brand. */
const ALIASES: Record<string, string[]> = {
  google: ["google workspace", "g suite", "gsuite"],
  googledrive: ["drive"],
  microsoft365: ["office 365", "office", "m365"],
  microsoftteams: ["teams"],
  microsoftoutlook: ["outlook"],
  openai: ["chatgpt"],
  claude: ["anthropic"],
  x: ["twitter"],
  mondaydotcom: ["monday"],
  adobe: ["creative cloud", "acrobat", "photoshop"],
};

export function getBrandIcon(key: string | null | undefined): BrandIcon | null {
  if (!key) return null;
  const hit = OWN[key] ?? BRAND_ICON_DATA[key];
  return hit ? { key, ...hit } : null;
}

const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Indexed = { icon: BrandIcon; words: string[] };
let index: Indexed[] | null = null;
function getIndex(): Indexed[] {
  if (!index) {
    const keys = [...Object.keys(OWN), ...Object.keys(BRAND_ICON_DATA)];
    index = keys.map((key) => {
      const icon = getBrandIcon(key)!;
      return { icon, words: [fold(icon.title), key, ...(ALIASES[key] ?? []).map(fold)] };
    });
  }
  return index;
}

/**
 * The catalogue admin's icon picker: brands whose name, key or alias matches
 * `query` (accent- and case-insensitive). Prefix matches rank first, glyphs
 * before colour-only entries. An empty query returns nothing.
 */
export function searchBrandIcons(query: string, limit = 12): BrandIcon[] {
  const q = fold(query);
  if (!q) return [];
  const compact = q.replace(/ /g, "");
  const scored: Array<{ icon: BrandIcon; score: number }> = [];
  for (const { icon, words } of getIndex()) {
    let score = -1;
    for (const w of words) {
      const wc = w.replace(/ /g, "");
      if (w === q || wc === compact) score = Math.max(score, 3);
      else if (w.startsWith(q) || wc.startsWith(compact)) score = Math.max(score, 2);
      else if (w.includes(q) || wc.includes(compact)) score = Math.max(score, 1);
    }
    if (score >= 0) scored.push({ icon, score: score * 2 + (icon.path ? 1 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.icon.title.localeCompare(b.icon.title))
    .slice(0, limit)
    .map((s) => s.icon);
}
