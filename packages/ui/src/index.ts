/**
 * Design system Open HelpDesk — point d'entrée.
 * Les tokens CSS (extraits des maquettes design/) sont dans ./tokens.css.
 * Les composants (DataTable, Drawer, CommandPalette, TuileKPI, BuilderConditions…)
 * arrivent avec le Lot 1 — voir specs/02-design-system.md.
 */

/** Concatène des classes conditionnelles sans dépendance. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
