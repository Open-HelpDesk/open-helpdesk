/**
 * The OpenAPI 3.1 description of the v1 API.
 *
 * Hand-written rather than generated: the route handlers are plain functions
 * with no schema decorators to derive from, so a generator would need its own
 * annotations — a second description of the same thing, free to drift. One
 * honest document next to the routes is the smaller lie, and it is served by
 * the running instance, so what you fetch is what that instance implements.
 *
 * Built here rather than inline in the route so the route stays three lines and
 * this file can be read as what it is: the contract.
 */

/* ---------- Building blocks ---------- */

const uuid = { type: "string", format: "uuid" } as const;
const dateTime = { type: "string", format: "date-time", nullable: true } as const;
const jsonObject = { type: "object", additionalProperties: true } as const;

/** The envelope every collection returns. */
function list(schema: string) {
  return {
    type: "object",
    properties: {
      data: { type: "array", items: { $ref: `#/components/schemas/${schema}` } },
      next_cursor: {
        type: "string",
        nullable: true,
        description: "Pass back as `cursor` for the next page. Null on the last page.",
      },
    },
    required: ["data", "next_cursor"],
  };
}

function ok(schema: string, description = "Success.") {
  return {
    description,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
  };
}

function okList(schema: string, description: string) {
  return { description, content: { "application/json": { schema: list(schema) } } };
}

const ERRORS = {
  400: { $ref: "#/components/responses/BadRequest" },
  401: { $ref: "#/components/responses/Unauthorized" },
  403: { $ref: "#/components/responses/Forbidden" },
  404: { $ref: "#/components/responses/NotFound" },
  429: { $ref: "#/components/responses/RateLimited" },
} as const;

const PAGE_PARAMS = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    description: "Rows per page.",
  },
  {
    name: "cursor",
    in: "query",
    schema: { type: "string" },
    description: "The `next_cursor` of the previous page.",
  },
] as const;

function pathParam(name: string, schema: object, description: string) {
  return { name, in: "path", required: true, schema, description };
}

/* ---------- Schemas ---------- */

const SCHEMAS = {
  Error: {
    type: "object",
    properties: {
      error: {
        type: "object",
        properties: {
          code: { type: "string", description: "A stable code to branch on." },
          message: { type: "string", description: "A sentence for a human." },
        },
        required: ["code", "message"],
      },
    },
    required: ["error"],
  },
  Ticket: {
    type: "object",
    properties: {
      number: { type: "integer", description: "Per-workspace ticket number, the one agents see." },
      subject: { type: "string" },
      status: { type: "string", enum: ["new", "open", "waiting", "on_hold", "resolved", "closed"] },
      priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
      channel: { type: "string", enum: ["email", "portal", "widget", "api"] },
      type: { type: "string", nullable: true },
      requester: {
        type: "object",
        nullable: true,
        properties: { id: uuid, email: { type: "string", format: "email" }, name: { type: "string", nullable: true } },
      },
      assignee_id: { ...uuid, nullable: true },
      organization_id: { ...uuid, nullable: true },
      created_at: dateTime,
      updated_at: dateTime,
    },
  },
  Message: {
    type: "object",
    properties: {
      id: uuid,
      kind: { type: "string", enum: ["public_reply", "internal_note", "system_event"] },
      author_type: { type: "string", enum: ["agent", "contact", "system"] },
      author_id: { ...uuid, nullable: true },
      body_text: { type: "string", nullable: true },
      body_html: { type: "string", nullable: true },
      source: { type: "string", nullable: true },
      created_at: dateTime,
    },
  },
  Contact: {
    type: "object",
    properties: {
      id: uuid,
      email: { type: "string", format: "email" },
      name: { type: "string", nullable: true },
      phone: { type: "string", nullable: true },
      locale: { type: "string", nullable: true },
      blocked: { type: "boolean" },
      custom_fields: jsonObject,
      created_at: dateTime,
    },
  },
  Organization: {
    type: "object",
    properties: {
      id: uuid,
      name: { type: "string" },
      email_domains: {
        type: "array",
        items: { type: "string" },
        description: "Domains that attach an incoming contact to this company automatically.",
      },
      shared_tickets: { type: "boolean" },
      notes: { type: "string", nullable: true },
      custom_fields: jsonObject,
      created_at: dateTime,
    },
  },
  Agent: {
    type: "object",
    properties: {
      id: uuid,
      email: { type: "string", format: "email" },
      name: { type: "string" },
      role: { type: "string", enum: ["owner", "admin", "agent", "viewer"] },
      status: { type: "string", enum: ["active", "invited", "disabled"] },
      available: { type: "boolean" },
      created_at: dateTime,
    },
  },
  Team: { type: "object", properties: { id: uuid, name: { type: "string" }, created_at: dateTime } },
  Macro: {
    type: "object",
    properties: {
      id: uuid,
      name: { type: "string" },
      category: { type: "string", nullable: true },
      actions: jsonObject,
      availability: { type: "string", enum: ["everyone", "team", "personal"] },
      team_id: { ...uuid, nullable: true },
      created_at: dateTime,
    },
  },
  SlaPolicy: {
    type: "object",
    properties: {
      id: uuid,
      name: { type: "string" },
      position: { type: "integer" },
      conditions: jsonObject,
      targets: {
        ...jsonObject,
        description: "Per priority: { first_reply_min, next_reply_min, resolve_min }.",
      },
      business_hours_id: { ...uuid, nullable: true },
      is_default: { type: "boolean" },
      active: { type: "boolean" },
    },
  },
  View: {
    type: "object",
    properties: {
      id: uuid,
      name: { type: "string" },
      shared: { type: "string", enum: ["private", "team", "everyone"] },
      team_id: { ...uuid, nullable: true },
      conditions: jsonObject,
      columns: jsonObject,
      sort: jsonObject,
      position: { type: "integer" },
    },
  },
  TicketField: {
    type: "object",
    properties: {
      id: uuid,
      key: { type: "string", description: "The key under which a value appears in `custom_fields`." },
      label: { type: "string" },
      type: { type: "string", enum: ["text", "select", "multi_select", "date", "number", "checkbox"] },
      options: jsonObject,
      portal_visible: { type: "boolean" },
      required: { type: "boolean" },
      position: { type: "integer" },
    },
  },
  Tag: {
    type: "object",
    properties: { name: { type: "string" }, ticket_count: { type: "integer" } },
  },
  KbCategory: {
    type: "object",
    properties: {
      id: uuid,
      parent_id: { ...uuid, nullable: true },
      name: { type: "string" },
      slug: { type: "string" },
      description: { type: "string", nullable: true },
      position: { type: "integer" },
    },
  },
  KbArticle: {
    type: "object",
    properties: {
      id: uuid,
      category_id: { ...uuid, nullable: true },
      title: { type: "string" },
      slug: { type: "string" },
      body_html: { type: "string" },
      status: { type: "string", enum: ["draft", "published"] },
      author_id: { ...uuid, nullable: true },
      published_at: dateTime,
      view_count: { type: "integer" },
      votes_up: { type: "integer" },
      votes_down: { type: "integer" },
      created_at: dateTime,
      updated_at: dateTime,
    },
  },
  Csat: {
    type: "object",
    properties: {
      id: uuid,
      ticket_id: uuid,
      agent_id: { ...uuid, nullable: true },
      score: { type: "string", enum: ["good", "bad"] },
      comment: { type: "string", nullable: true },
      created_at: dateTime,
    },
  },
  Attachment: {
    type: "object",
    properties: {
      id: uuid,
      message_id: { ...uuid, nullable: true },
      filename: { type: "string" },
      content_type: { type: "string" },
      size_bytes: { type: "integer" },
      download_url: { type: "string", description: "Fetch with the same API key." },
      created_at: dateTime,
    },
  },
} as const;

/* ---------- Paths ---------- */

function collection(tag: string, schema: string, summary: string, extraParams: object[] = []) {
  return {
    tags: [tag],
    summary,
    security: [{ ApiKey: ["read"] }],
    parameters: [...PAGE_PARAMS, ...extraParams],
    responses: { 200: okList(schema, summary), ...ERRORS },
  };
}

function buildPaths() {
  return {
    "/tickets": {
      get: collection("Tickets", "Ticket", "List tickets", [
        { name: "status", in: "query", schema: { type: "string" }, description: "Comma-separated statuses." },
        { name: "priority", in: "query", schema: { type: "string" }, description: "Comma-separated priorities." },
        { name: "assignee_id", in: "query", schema: uuid },
        { name: "organization_id", in: "query", schema: uuid },
        { name: "requester_id", in: "query", schema: uuid },
        { name: "tag", in: "query", schema: { type: "string" } },
        {
          name: "updated_since",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Only tickets touched since this instant — the basis of an incremental sync.",
        },
      ]),
      post: {
        tags: ["Tickets"],
        summary: "Create a ticket",
        description:
          "Goes through the same path as an inbound email: the requester is found or created, " +
          "rules and SLA policies run, and outbound webhooks fire.",
        security: [{ ApiKey: ["ticket:create"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["requester_email", "subject", "message"],
                properties: {
                  requester_email: { type: "string", format: "email" },
                  requester_name: { type: "string" },
                  subject: { type: "string", maxLength: 500 },
                  message: { type: "string" },
                  priority: { type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal" },
                  organization_id: uuid,
                  tags: { type: "array", items: { type: "string" }, maxItems: 30 },
                  custom_fields: jsonObject,
                },
              },
            },
          },
        },
        responses: { 201: ok("Ticket", "The ticket as created."), ...ERRORS },
      },
    },
    "/tickets/{number}": {
      parameters: [pathParam("number", { type: "integer" }, "The ticket number agents see.")],
      get: {
        tags: ["Tickets"],
        summary: "Read a ticket",
        security: [{ ApiKey: ["read"] }],
        responses: { 200: ok("Ticket"), ...ERRORS },
      },
      patch: {
        tags: ["Tickets"],
        summary: "Update a ticket",
        description: "`custom_fields` is merged, not replaced: omitting a key leaves it alone.",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["new", "open", "waiting", "on_hold", "resolved", "closed"] },
                  priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                  assignee_id: { ...uuid, nullable: true },
                  organization_id: { ...uuid, nullable: true },
                  subject: { type: "string", maxLength: 500 },
                  type: { type: "string", nullable: true },
                  tags: { type: "array", items: { type: "string" }, maxItems: 30 },
                  custom_fields: jsonObject,
                },
              },
            },
          },
        },
        responses: { 200: ok("Ticket"), ...ERRORS },
      },
    },
    "/tickets/{number}/messages": {
      parameters: [pathParam("number", { type: "integer" }, "The ticket number.")],
      get: {
        tags: ["Tickets"],
        summary: "List a ticket's messages",
        description: "Oldest first — the order a human reads the thread in.",
        security: [{ ApiKey: ["read"] }],
        parameters: [...PAGE_PARAMS],
        responses: { 200: okList("Message", "The conversation."), ...ERRORS },
      },
      post: {
        tags: ["Tickets"],
        summary: "Add a reply or an internal note",
        description:
          "A public reply reaches the customer and fires the same rules the product does; " +
          "an internal note stays inside the workspace.",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: {
                  body: { type: "string" },
                  internal: { type: "boolean", default: false },
                  agent_id: { ...uuid, description: "The agent the message is attributed to." },
                },
              },
            },
          },
        },
        responses: { 201: ok("Message"), ...ERRORS },
      },
    },
    "/tickets/{number}/attachments": {
      parameters: [pathParam("number", { type: "integer" }, "The ticket number.")],
      get: {
        tags: ["Tickets"],
        summary: "List every file on a ticket",
        security: [{ ApiKey: ["read"] }],
        responses: { 200: okList("Attachment", "Files across the whole thread."), ...ERRORS },
      },
    },
    "/attachments/{id}/download": {
      parameters: [pathParam("id", uuid, "The attachment id.")],
      get: {
        tags: ["Attachments"],
        summary: "Download a file",
        description: "Streams the file itself. The API key is the only way in — there is no signed URL.",
        security: [{ ApiKey: ["read"] }],
        responses: {
          200: {
            description: "The file.",
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
          ...ERRORS,
        },
      },
    },
    "/contacts": {
      get: collection("Contacts", "Contact", "List contacts", [
        { name: "email", in: "query", schema: { type: "string", format: "email" }, description: "Exact address." },
      ]),
      post: {
        tags: ["Contacts"],
        summary: "Create a contact",
        description: "Idempotent by email: an address that already exists comes back with 200, not a duplicate.",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email" },
                  name: { type: "string" },
                  phone: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 200: ok("Contact", "The existing contact."), 201: ok("Contact", "The contact as created."), ...ERRORS },
      },
    },
    "/contacts/{id}": {
      parameters: [pathParam("id", uuid, "The contact id.")],
      get: { tags: ["Contacts"], summary: "Read a contact", security: [{ ApiKey: ["read"] }], responses: { 200: ok("Contact"), ...ERRORS } },
      patch: {
        tags: ["Contacts"],
        summary: "Update a contact",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  name: { type: "string", nullable: true },
                  phone: { type: "string", nullable: true },
                  locale: { type: "string", nullable: true },
                  blocked: { type: "boolean" },
                  custom_fields: jsonObject,
                },
              },
            },
          },
        },
        responses: { 200: ok("Contact"), 409: { $ref: "#/components/responses/Conflict" }, ...ERRORS },
      },
      delete: {
        tags: ["Contacts"],
        summary: "Delete a contact (GDPR erasure)",
        description:
          "Refused with 409 while the person still has tickets, unless `delete_tickets=true` is passed — " +
          "erasing a support history should be asked for, not inferred. To merely stop someone writing in, " +
          "set `blocked` instead.",
        security: [{ ApiKey: ["write"] }],
        parameters: [
          { name: "delete_tickets", in: "query", schema: { type: "boolean" }, description: "Also erase their tickets." },
        ],
        responses: {
          204: { description: "Deleted." },
          409: { $ref: "#/components/responses/Conflict" },
          ...ERRORS,
        },
      },
    },
    "/organizations": {
      get: collection("Organizations", "Organization", "List organizations"),
      post: {
        tags: ["Organizations"],
        summary: "Create an organization",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", maxLength: 200 },
                  email_domains: { type: "array", items: { type: "string" }, maxItems: 50 },
                  shared_tickets: { type: "boolean" },
                  notes: { type: "string" },
                  custom_fields: jsonObject,
                },
              },
            },
          },
        },
        responses: { 201: ok("Organization"), ...ERRORS },
      },
    },
    "/organizations/{id}": {
      parameters: [pathParam("id", uuid, "The organization id.")],
      get: { tags: ["Organizations"], summary: "Read an organization", security: [{ ApiKey: ["read"] }], responses: { 200: ok("Organization"), ...ERRORS } },
      patch: {
        tags: ["Organizations"],
        summary: "Update an organization",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email_domains: { type: "array", items: { type: "string" } },
                  shared_tickets: { type: "boolean" },
                  notes: { type: "string", nullable: true },
                  custom_fields: jsonObject,
                },
              },
            },
          },
        },
        responses: { 200: ok("Organization"), ...ERRORS },
      },
      delete: {
        tags: ["Organizations"],
        summary: "Delete an organization",
        description: "Its tickets are detached, never deleted: a customer's history outlives the company record.",
        security: [{ ApiKey: ["write"] }],
        responses: { 204: { description: "Deleted." }, ...ERRORS },
      },
    },
    "/agents": { get: collection("Workspace", "Agent", "List agents") },
    "/teams": { get: collection("Workspace", "Team", "List teams") },
    "/macros": { get: collection("Workspace", "Macro", "List macros") },
    "/sla-policies": { get: collection("Workspace", "SlaPolicy", "List SLA policies") },
    "/views": { get: collection("Workspace", "View", "List saved views") },
    "/ticket-fields": { get: collection("Workspace", "TicketField", "List custom ticket fields") },
    "/tags": {
      get: {
        tags: ["Workspace"],
        summary: "List tags in use",
        description: "Derived from the tickets themselves — the product keeps no separate tag registry.",
        security: [{ ApiKey: ["read"] }],
        responses: { 200: okList("Tag", "Tags with how many tickets carry each."), ...ERRORS },
      },
    },
    "/csat": { get: collection("Workspace", "Csat", "List satisfaction responses") },
    "/kb/categories": { get: collection("Knowledge base", "KbCategory", "List categories") },
    "/kb/articles": {
      get: collection("Knowledge base", "KbArticle", "List articles", [
        { name: "status", in: "query", schema: { type: "string", enum: ["draft", "published"] } },
        { name: "category_id", in: "query", schema: uuid },
      ]),
      post: {
        tags: ["Knowledge base"],
        summary: "Create an article",
        description: "Lands as a draft unless `status` says otherwise: publishing puts text in front of customers.",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "category_id"],
                properties: {
                  title: { type: "string", maxLength: 300 },
                  category_id: uuid,
                  body_html: { type: "string" },
                  slug: { type: "string", description: "Derived from the title when omitted." },
                  status: { type: "string", enum: ["draft", "published"], default: "draft" },
                },
              },
            },
          },
        },
        responses: { 201: ok("KbArticle"), 409: { $ref: "#/components/responses/Conflict" }, ...ERRORS },
      },
    },
    "/kb/articles/{id}": {
      parameters: [pathParam("id", uuid, "The article id.")],
      get: { tags: ["Knowledge base"], summary: "Read an article", security: [{ ApiKey: ["read"] }], responses: { 200: ok("KbArticle"), ...ERRORS } },
      patch: {
        tags: ["Knowledge base"],
        summary: "Update an article",
        description: "`published_at` is stamped on the first publication only — a re-publish never rewrites it.",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  body_html: { type: "string" },
                  category_id: uuid,
                  slug: { type: "string" },
                  status: { type: "string", enum: ["draft", "published"] },
                },
              },
            },
          },
        },
        responses: { 200: ok("KbArticle"), 409: { $ref: "#/components/responses/Conflict" }, ...ERRORS },
      },
      delete: {
        tags: ["Knowledge base"],
        summary: "Delete an article",
        security: [{ ApiKey: ["write"] }],
        responses: { 204: { description: "Deleted." }, ...ERRORS },
      },
    },
  };
}

/* ---------- The document ---------- */

export function openApiDocument(origin: string) {
  const errorResponse = (description: string) => ({
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "Open HelpDesk API",
      version: "1.0.0",
      summary: "Read and write everything a support workspace holds.",
      description: [
        "The REST API of a single workspace. Authentication is by API key, minted in",
        "**Settings → API & webhooks**; the key carries its own workspace, so a call works",
        "whatever host it lands on and only ever sees that one workspace.",
        "",
        "### Conventions",
        "",
        "- Every collection returns `{ data, next_cursor }`. Keep calling with `cursor` until",
        "  `next_cursor` is null — never count pages, rows move while you read.",
        "- Timestamps are ISO 8601 in UTC. Money and durations are integers.",
        "- Errors always carry `{ error: { code, message } }`: branch on `code`, show `message`.",
        "- Writing a ticket runs the same rules, SLA policies and webhooks as the product itself.",
        "  There is no quiet back door.",
        "",
        "### Rate limit",
        "",
        "600 requests per minute per key. Over it, `429` with a `Retry-After` header.",
      ].join("\n"),
      license: { name: "AGPL-3.0-only", identifier: "AGPL-3.0-only" },
    },
    servers: [{ url: `${origin}/api/v1`, description: "This workspace." }],
    tags: [
      { name: "Tickets", description: "Requests, their conversations and their files." },
      { name: "Contacts", description: "The people who write in." },
      { name: "Organizations", description: "The companies they belong to." },
      { name: "Knowledge base", description: "Help centre categories and articles." },
      { name: "Attachments", description: "Files exchanged on tickets." },
      { name: "Workspace", description: "Agents, teams and the configuration rules run on." },
    ],
    paths: buildPaths(),
    components: {
      securitySchemes: {
        ApiKey: {
          type: "http",
          scheme: "bearer",
          description:
            "`Authorization: Bearer ohd_live_…`. A key carries scopes: `read`, `write`, " +
            "`ticket:create`. A key without the scope a route needs gets 403, not 401.",
        },
      },
      schemas: SCHEMAS,
      responses: {
        BadRequest: errorResponse("The request is malformed — see `code`."),
        Unauthorized: errorResponse("Missing, unknown or revoked API key."),
        Forbidden: errorResponse("The key is known but lacks the scope, or the workspace is suspended."),
        NotFound: errorResponse("No such object in this workspace."),
        Conflict: errorResponse("The write clashes with something that already exists."),
        RateLimited: errorResponse("Too many requests. Retry after the delay in `Retry-After`."),
      },
    },
    security: [{ ApiKey: [] }],
  };
}
