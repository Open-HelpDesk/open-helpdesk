/**
 * The Open HelpDesk MCP server.
 *
 * Tools chosen for what someone actually does with a helpdesk — find the ticket,
 * read the thread, look up what we already told other people, answer, file it —
 * rather than one tool per endpoint. A faithful mirror of the REST API would be
 * thirty-two tools an assistant has to choose between, and it would choose
 * badly.
 *
 * Every write is annotated as such, and the two that reach a customer
 * (`create_ticket`, `reply_to_ticket` in public mode) say so in their
 * description, because a client that asks for confirmation can only ask about
 * what it was told.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiError, HelpdeskClient, type ClientConfig } from "./client";

/** Tool results are text: JSON an assistant can read, pretty-printed. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function failed(error: unknown) {
  if (error instanceof ApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `The workspace refused the call (${error.status} ${error.code}): ${error.message}`,
        },
      ],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: `Could not reach the workspace: ${message}` }] };
}

async function guard<T>(run: () => Promise<T>) {
  try {
    return json(await run());
  } catch (error) {
    return failed(error);
  }
}

const STATUS = z.enum(["new", "open", "waiting", "on_hold", "resolved", "closed"]);
const PRIORITY = z.enum(["low", "normal", "high", "urgent"]);

export function createServer(config: ClientConfig): McpServer {
  const api = new HelpdeskClient(config);
  const server = new McpServer({ name: "open-helpdesk", version: "0.2.0" });

  /* ---------- Finding and reading ---------- */

  server.registerTool(
    "search_tickets",
    {
      title: "Search tickets",
      description:
        "Find tickets in the workspace. Filter by status, priority, assignee, organization, tag, " +
        "or what changed since a given time. Returns a summary of each — use get_ticket to read a " +
        "conversation.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        status: z.array(STATUS).optional().describe("Only these statuses."),
        priority: z.array(PRIORITY).optional().describe("Only these priorities."),
        assignee_id: z.string().uuid().optional(),
        organization_id: z.string().uuid().optional(),
        requester_id: z.string().uuid().optional(),
        tag: z.string().optional(),
        updated_since: z
          .string()
          .optional()
          .describe("ISO 8601 instant; only tickets touched since then."),
        limit: z.number().int().min(1).max(200).default(25),
      },
    },
    async (input) =>
      guard(async () => {
        const { items, truncated } = await api.collect<Record<string, unknown>>(
          "/tickets",
          {
            status: input.status?.join(","),
            priority: input.priority?.join(","),
            assignee_id: input.assignee_id,
            organization_id: input.organization_id,
            requester_id: input.requester_id,
            tag: input.tag,
            updated_since: input.updated_since,
          },
          input.limit,
        );
        return { count: items.length, truncated, tickets: items };
      }),
  );

  server.registerTool(
    "get_ticket",
    {
      title: "Read a ticket",
      description:
        "The ticket and its whole conversation, oldest message first, including internal notes. " +
        "Use this before answering: the thread usually holds what was already tried.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        number: z.number().int().describe("The ticket number agents see, e.g. 4821."),
        include_attachments: z.boolean().default(false),
      },
    },
    async ({ number, include_attachments }) =>
      guard(async () => {
        const ticket = await api.get(`/tickets/${number}`);
        const messages = await api.collect(`/tickets/${number}/messages`, {}, 200);
        const attachments = include_attachments
          ? await api.get(`/tickets/${number}/attachments`)
          : undefined;
        return {
          ticket,
          messages: messages.items,
          messages_truncated: messages.truncated,
          ...(attachments ? { attachments } : {}),
        };
      }),
  );

  server.registerTool(
    "search_knowledge_base",
    {
      title: "Search the knowledge base",
      description:
        "Published help-centre articles. Look here BEFORE writing an answer from scratch: if we " +
        "already documented it, quote the article and link it rather than paraphrasing it differently.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        query: z.string().optional().describe("Words to match in the title or body."),
        include_drafts: z.boolean().default(false),
        limit: z.number().int().min(1).max(50).default(10),
      },
    },
    async ({ query, include_drafts, limit }) =>
      guard(async () => {
        const { items } = await api.collect<{
          title: string;
          body_html: string;
          [k: string]: unknown;
        }>("/kb/articles", include_drafts ? {} : { status: "published" }, 200);

        // Filtered here rather than in the API: the product has no full-text
        // search endpoint, and inventing a fuzzy one server-side would be a
        // different search from the one the help centre performs.
        const needle = query?.toLowerCase().trim();
        const matched = needle
          ? items.filter(
              (a) =>
                a.title.toLowerCase().includes(needle) ||
                String(a.body_html ?? "").toLowerCase().includes(needle),
            )
          : items;
        return {
          count: Math.min(matched.length, limit),
          total_matched: matched.length,
          articles: matched.slice(0, limit).map(({ body_html, ...rest }) => ({
            ...rest,
            excerpt: String(body_html ?? "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 400),
          })),
        };
      }),
  );

  server.registerTool(
    "get_article",
    {
      title: "Read an article",
      description: "One knowledge-base article in full, with its HTML body.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => guard(() => api.get(`/kb/articles/${id}`)),
  );

  server.registerTool(
    "find_contact",
    {
      title: "Find a contact",
      description:
        "Look someone up by email address, or list recent contacts. Returns the contact id that " +
        "search_tickets takes as requester_id.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        email: z.string().optional().describe("Exact address."),
        limit: z.number().int().min(1).max(100).default(25),
      },
    },
    async ({ email, limit }) =>
      guard(async () => {
        const { items } = await api.collect("/contacts", { email }, limit);
        return { count: items.length, contacts: items };
      }),
  );

  server.registerTool(
    "list_workspace",
    {
      title: "List workspace configuration",
      description:
        "Agents, teams, organizations or tags — whichever you need to assign or file a ticket " +
        "correctly. Ask for what you need rather than fetching all four.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        what: z.enum(["agents", "teams", "organizations", "tags"]),
        limit: z.number().int().min(1).max(200).default(100),
      },
    },
    async ({ what, limit }) =>
      guard(async () => {
        const { items, truncated } = await api.collect(`/${what}`, {}, limit);
        return { count: items.length, truncated, [what]: items };
      }),
  );

  /* ---------- Writing ---------- */

  server.registerTool(
    "create_ticket",
    {
      title: "Create a ticket",
      description:
        "Open a new ticket on behalf of someone. **This reaches a real customer**: the workspace's " +
        "rules, SLA policies and acknowledgement emails run exactly as they would for an inbound " +
        "email. Do not use it to take notes.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      inputSchema: {
        requester_email: z.string().describe("The person the ticket is for."),
        requester_name: z.string().optional(),
        subject: z.string().max(500),
        message: z.string().describe("The first message of the thread, in their words."),
        priority: PRIORITY.default("normal"),
        tags: z.array(z.string()).max(30).optional(),
        organization_id: z.string().uuid().optional(),
      },
    },
    async (input) => guard(() => api.post("/tickets", input)),
  );

  server.registerTool(
    "reply_to_ticket",
    {
      title: "Reply to a ticket",
      description:
        "Add a message to a thread. `internal: true` writes a note only agents see — prefer it " +
        "when drafting or summarising. `internal: false` **sends the message to the customer** " +
        "and fires the workspace's rules; ask the person you are helping before doing that.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      inputSchema: {
        number: z.number().int().describe("The ticket number."),
        body: z.string(),
        internal: z
          .boolean()
          .default(true)
          .describe("Defaults to an internal note, which nobody outside the workspace sees."),
        agent_id: z.string().uuid().optional().describe("The agent the message is attributed to."),
      },
    },
    async ({ number, ...body }) => guard(() => api.post(`/tickets/${number}/messages`, body)),
  );

  server.registerTool(
    "update_ticket",
    {
      title: "Update a ticket",
      description:
        "Change status, priority, assignee, tags, type or organization. Sends nothing to the " +
        "customer, but does fire the workspace's rules — which may.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: {
        number: z.number().int(),
        status: STATUS.optional(),
        priority: PRIORITY.optional(),
        assignee_id: z.string().uuid().nullable().optional(),
        organization_id: z.string().uuid().nullable().optional(),
        tags: z.array(z.string()).max(30).optional(),
        type: z.string().nullable().optional(),
      },
    },
    async ({ number, ...patch }) => {
      const body = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(body).length === 0) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Nothing to change: pass at least one field." }],
        };
      }
      return guard(() => api.patch(`/tickets/${number}`, body));
    },
  );

  return server;
}
