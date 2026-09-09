/**
 * The thin HTTP client the MCP tools call.
 *
 * The server talks to the **public REST API**, never to the database. That is
 * the whole design: an assistant reaching a workspace inherits the API key's
 * scopes, its rate limit and its tenant isolation, and cannot reach round the
 * rules engine. It also means the same server works against the hosted product
 * and against someone's self-hosted instance, with nothing but a URL and a key.
 */

export type ClientConfig = {
  /** Workspace root, e.g. https://acme.open-helpdesk.com */
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class HelpdeskClient {
  private readonly root: string;

  constructor(private readonly config: ClientConfig) {
    // Tolerate both "https://acme…" and "https://acme…/api/v1": people paste
    // whichever they had in front of them, and being strict about it would only
    // produce a 404 they have to guess at.
    // Boucle et non `replace(/\/+$/, "")` : ancrée à la fin, cette regex fait
    // quand même essayer chaque position de départ au moteur, d'où un coût
    // quadratique sur une longue suite de barres (js/polynomial-redos). Retirer
    // les barres une à une est linéaire et se lit aussi bien.
    let trimmed = config.baseUrl;
    while (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
    this.root = trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${this.root}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    const doFetch = this.config.fetchImpl ?? fetch;
    const response = await doFetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let payload: unknown = undefined;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      // A non-JSON body from a 5xx or a proxy: keep the text, it is the only clue.
    }

    if (!response.ok) {
      const error = (payload as { error?: { code?: string; message?: string } } | undefined)?.error;
      throw new ApiError(
        response.status,
        error?.code ?? "http_error",
        error?.message ?? text.slice(0, 300) ?? `HTTP ${response.status}`,
      );
    }
    return payload as T;
  }

  get<T>(path: string, query?: Record<string, unknown>) {
    return this.request<T>("GET", path, { query });
  }
  post<T>(path: string, body: unknown) {
    return this.request<T>("POST", path, { body });
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, { body });
  }

  /**
   * Walks a paginated collection to the end.
   *
   * Capped, because an assistant asking for "all tickets" on a workspace with
   * two hundred thousand of them would blow past any context window and take a
   * minute doing it. The cap is reported to the caller rather than hidden.
   */
  async collect<T>(
    path: string,
    query: Record<string, unknown> = {},
    max = 200,
  ): Promise<{ items: T[]; truncated: boolean }> {
    const items: T[] = [];
    let cursor: string | null = null;
    do {
      const page: { data: T[]; next_cursor: string | null } = await this.get(path, {
        ...query,
        limit: Math.min(100, max - items.length),
        cursor,
      });
      items.push(...page.data);
      cursor = page.next_cursor;
    } while (cursor && items.length < max);
    return { items, truncated: Boolean(cursor) };
  }
}
