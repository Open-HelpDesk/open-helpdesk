/**
 * Open HelpDesk design system — entry point.
 * The CSS tokens (extracted from the design/ mockups) live in ./tokens.css.
 * The components (DataTable, Drawer, CommandPalette, TuileKPI, BuilderConditions…)
 * land with Lot 1.
 */

/** Joins conditional class names together, with no dependency. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
