/**
 * The OpenAPI description of the v1 API, served by the API itself.
 *
 * Hand-written rather than generated: the route handlers are plain functions
 * with no schema decorators to derive from, so a generator would need its own
 * annotations — a second description of the same thing, free to drift. Keeping
 * one honest document next to the routes is the smaller lie, and it is served
 * from the running instance so what you fetch is what that instance implements.
 *
 * Public on purpose: a description of the shape is not a secret, and an
 * integrator needs it before they have a key.
 */
const TICKET_SCHEMA = {
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
      properties: {
        id: { type: "string", format: "uuid" },
        email: { type: "string", format: "email" },
        name: { type: "string", nullable: true },
      },
    },
    assignee_id: { type: "string", format: "uuid", nullable: true },
    organization_id: { type: "string", format: "uuid", nullable: true },
    created_at: { type: "string", format: "date-time", nullable: true },
    updated_at: { type: "string", format: "date-time", nullable: true },
  },
} as const;

const CONTACT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    name: { type: "string", nullable: true },
    phone: { type: "string", nullable: true },
    blocked: { type: "boolean" },
    created_at: { type: "string", format: "date-time", nullable: true },
  },
} as const;

const ERROR_SCHEMA = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string", description: "Stable machine-readable code." },
        message: { type: "string", description: "Human-readable explanation." },
      },
    },
  },
} as const;

function errorResponses(...codes: number[]) {
  const all: Record<string, { description: string; content: unknown }> = {
    "400": { description: "Invalid request body or parameter.", content: { "application/json": { schema: ERROR_SCHEMA } } },
    "401": { description: "Missing, unknown or revoked API key.", content: { "application/json": { schema: ERROR_SCHEMA } } },
    "403": { description: "The key lacks the required scope, or the workspace is suspended.", content: { "application/json": { schema: ERROR_SCHEMA } } },
    "404": { description: "No such resource in this workspace.", content: { "application/json": { schema: ERROR_SCHEMA } } },
  };
  return Object.fromEntries(codes.map((c) => [String(c), all[String(c)]!]));
}

export function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Open HelpDesk API",
      version: "1.0.0",
      description:
        "REST API of a single Open HelpDesk workspace. The API key identifies the " +
        "workspace, so every call is scoped to it — there is no workspace parameter.",
    },
    servers: [{ url: `${origin}/api/v1`, description: "This workspace" }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description:
            "An API key created in Settings → API, sent as `Authorization: Bearer ohd_live_…`. " +
            "Its scopes decide what it may do: `read` for GETs, `write` for changes, " +
            "`ticket:create` to open tickets.",
        },
      },
      schemas: { Ticket: TICKET_SCHEMA, Contact: CONTACT_SCHEMA, Error: ERROR_SCHEMA },
    },
    paths: {
      "/tickets": {
        get: {
          summary: "List tickets",
          description: "Most recent first, by descending ticket number. Requires the `read` scope.",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["new", "open", "waiting", "on_hold", "resolved", "closed"] },
            },
          ],
          responses: {
            "200": {
              description: "A page of tickets.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { type: "array", items: { $ref: "#/components/schemas/Ticket" } } },
                  },
                },
              },
            },
            ...errorResponses(400, 401, 403),
          },
        },
        post: {
          summary: "Create a ticket",
          description:
            "Opens a ticket on the `api` channel, exactly as an inbound email would: the " +
            "requester is found or created by email, the message becomes the first public " +
            "reply, then automations and SLA policies run. Requires the `ticket:create` scope.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["requester_email", "subject", "message"],
                  properties: {
                    requester_email: { type: "string", format: "email" },
                    requester_name: { type: "string", nullable: true },
                    subject: { type: "string", maxLength: 500 },
                    message: { type: "string" },
                    priority: { type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "The created ticket.", content: { "application/json": { schema: { $ref: "#/components/schemas/Ticket" } } } },
            ...errorResponses(400, 401, 403),
          },
        },
      },
      "/tickets/{number}": {
        parameters: [{ name: "number", in: "path", required: true, schema: { type: "integer" } }],
        get: {
          summary: "Read a ticket",
          description: "Requires the `read` scope.",
          responses: {
            "200": { description: "The ticket.", content: { "application/json": { schema: { $ref: "#/components/schemas/Ticket" } } } },
            ...errorResponses(401, 403, 404),
          },
        },
        patch: {
          summary: "Update a ticket",
          description:
            "Changes status, priority or assignee. Emits `ticket.updated`, plus `ticket.solved` " +
            "when the status becomes `resolved`. Requires the `write` scope.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "At least one field.",
                  properties: {
                    status: { type: "string", enum: ["new", "open", "waiting", "on_hold", "resolved", "closed"] },
                    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                    assignee_id: { type: "string", format: "uuid", nullable: true, description: "An agent of this workspace, or null to unassign." },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "The updated ticket.", content: { "application/json": { schema: { $ref: "#/components/schemas/Ticket" } } } },
            ...errorResponses(400, 401, 403, 404),
          },
        },
      },
      "/tickets/{number}/messages": {
        parameters: [{ name: "number", in: "path", required: true, schema: { type: "integer" } }],
        post: {
          summary: "Add a reply or an internal note",
          description:
            "A public reply is sent to the requester and fires automations; an internal note " +
            "stays inside the workspace. Requires the `write` scope.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["body"],
                  properties: {
                    body: { type: "string" },
                    internal: { type: "boolean", default: false, description: "true writes an internal note." },
                    agent_id: { type: "string", format: "uuid", nullable: true, description: "The agent to attribute it to." },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "The created message.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      ticket_number: { type: "integer" },
                      internal: { type: "boolean" },
                      created_at: { type: "string", format: "date-time", nullable: true },
                    },
                  },
                },
              },
            },
            ...errorResponses(400, 401, 403, 404),
          },
        },
      },
      "/contacts": {
        get: {
          summary: "List contacts",
          description: "Most recently created first. Requires the `read` scope.",
          parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } }],
          responses: {
            "200": {
              description: "A page of contacts.",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Contact" } } } },
                },
              },
            },
            ...errorResponses(401, 403),
          },
        },
        post: {
          summary: "Create a contact",
          description:
            "Idempotent by email: a contact that already exists is returned with 200 instead " +
            "of being duplicated. Requires the `write` scope.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: {
                    email: { type: "string", format: "email" },
                    name: { type: "string", nullable: true },
                    phone: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "The contact already existed.", content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } } },
            "201": { description: "The created contact.", content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } } },
            ...errorResponses(400, 401, 403),
          },
        },
      },
      "/contacts/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        get: {
          summary: "Read a contact",
          description: "Requires the `read` scope.",
          responses: {
            "200": { description: "The contact.", content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } } },
            ...errorResponses(401, 403, 404),
          },
        },
      },
    },
    "x-webhooks": {
      description:
        "Endpoints registered in Settings → API receive a POST for each subscribed event. " +
        "The body carries { event, occurred_at, ticket }, where ticket is the same shape as " +
        "the REST resource. Verify `x-ohd-signature: sha256=<hex>` as HMAC-SHA256 of the raw " +
        "body with the endpoint's signing secret; `x-ohd-event` repeats the event name. " +
        "An endpoint failing for seven consecutive days is switched off.",
      events: ["ticket.created", "ticket.updated", "ticket.solved", "message.created"],
    },
  };

  return Response.json(spec, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
