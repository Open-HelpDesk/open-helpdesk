/**
 * Copy of the "no such workspace" answer, in one place.
 *
 * Two very different runtimes have to render it, so the wording would drift if
 * each kept its own: the middleware builds a plain HTML string (edge runtime,
 * no React available there) for a host whose *shape* is already wrong, and
 * app/not-found.tsx renders JSX for a host whose shape is fine but whose
 * workspace does not exist. Same situation for whoever typed the address —
 * hence the same words.
 *
 * English, deliberately: the language comes from the tenant, and the tenant is
 * exactly what could not be resolved.
 */
export const WORKSPACE_NOT_FOUND = {
  title: "This workspace does not exist",
  body: "Check the address — or create your own workspace in under a minute.",
  cta: "Create my workspace",
} as const;
