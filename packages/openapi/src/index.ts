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

const uuid = {
  type: "string",
  format: "uuid",
  examples: ["3f2a1c94-8e5b-4d17-9f60-2c7b1a0d5e83"],
} as const;
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

/**
 * A failure worth naming on the route itself.
 *
 * The shared `responses` entries say what a status means across the API; these
 * say what it means here — "wrong email or password" is not the same 401 as "no
 * such key", and a client branching on `code` deserves to read that in the
 * reference rather than discover it.
 */
function errorRef(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

/**
 * The `multipart/form-data` twin of a JSON body, for the endpoints that accept
 * files (MA-02, MA-03, MC-02, MC-03).
 *
 * Same fields, as text, plus `files`. Declared as an alternative content type
 * rather than a separate endpoint: "post the message, then upload to it" leaves
 * a message promising a file that a dropped connection never delivers.
 */
function withFiles(properties: object, required: string[]) {
  return {
    schema: {
      type: "object",
      required,
      properties: {
        ...properties,
        files: {
          type: "array",
          items: { type: "string", format: "binary" },
          maxItems: 10,
          description:
            "Up to 10 files. The whole request must stay under 10 MB — over that the body is refused with 413 `request_too_large`, so a 10 MB file has to travel on its own message.",
        },
      },
    },
  };
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
      number: { type: "integer", description: "Per-workspace ticket number, the one agents see.", examples: [4821] },
      subject: { type: "string", examples: ["Cannot export invoices as PDF"] },
      status: { type: "string", enum: ["new", "open", "waiting", "on_hold", "resolved", "closed"], examples: ["open"] },
      priority: { type: "string", enum: ["low", "normal", "high", "urgent"], examples: ["high"] },
      channel: { type: "string", enum: ["email", "portal", "widget", "api"], examples: ["email"] },
      type: { type: "string", nullable: true },
      requester: {
        type: "object",
        nullable: true,
        properties: { id: uuid, email: { type: "string", format: "email" }, name: { type: "string", nullable: true } },
      },
      assignee_id: { ...uuid, nullable: true },
      organization_id: { ...uuid, nullable: true },
      sla: {
        type: "object",
        description:
          "The clock on this ticket. Instants, not remaining durations: a client that has been asleep would otherwise show an hour-old countdown as current. `warned_at` and `breached_at` are stamped by the workspace itself, so they say what it has already acted on.",
        properties: {
          first_reply_due_at: dateTime,
          next_reply_due_at: dateTime,
          resolve_due_at: dateTime,
          first_replied_at: dateTime,
          warned_at: dateTime,
          breached_at: dateTime,
        },
      },
      created_at: dateTime,
      updated_at: dateTime,
      unread: {
        type: "boolean",
        description:
          "Is there a message this agent has not seen — one they did not write themselves, newer than the last time they marked the ticket read (POST /tickets/{number}/read). Present only for an agent session: a workspace API key has no \"I\" to answer for, so the field is absent rather than guessed.",
      },
    },
  },
  Message: {
    type: "object",
    properties: {
      id: uuid,
      kind: { type: "string", enum: ["public_reply", "internal_note", "system_event"] },
      author_type: { type: "string", enum: ["agent", "contact", "system"] },
      author_id: { ...uuid, nullable: true },
      body_text: { type: "string", nullable: true, examples: ["Hello, the PDF export fails since this morning."] },
      body_html: { type: "string", nullable: true },
      source: { type: "string", nullable: true },
      created_at: dateTime,
    },
  },
  Contact: {
    type: "object",
    properties: {
      id: uuid,
      email: { type: "string", format: "email", examples: ["julien.lambert@nordfil.fr"] },
      name: { type: "string", nullable: true, examples: ["Julien Lambert"] },
      phone: { type: "string", nullable: true, examples: ["+33 1 23 45 67 89"] },
      locale: { type: "string", nullable: true, examples: ["fr"] },
      blocked: { type: "boolean" },
      custom_fields: jsonObject,
      created_at: dateTime,
    },
  },
  Organization: {
    type: "object",
    properties: {
      id: uuid,
      name: { type: "string", examples: ["Nordfil SAS"] },
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
      count: {
        type: "integer",
        description:
          "Tickets the view currently holds — the badge, without paging through them.",
        examples: [12],
      },
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
    properties: {
      name: { type: "string", examples: ["billing"] },
      ticket_count: { type: "integer", examples: [128] },
    },
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
      title: { type: "string", examples: ["Exporting your invoices"] },
      slug: { type: "string", examples: ["exporting-your-invoices"] },
      body_html: { type: "string", examples: ["<p>Open <strong>Billing</strong>, then…</p>"] },
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
  Session: {
    type: "object",
    description:
      "The result of signing in on a device. `token` is shown once and cannot be recovered — " +
      "store it in the platform keychain, not in application storage.",
    properties: {
      token: { type: "string", examples: ["ohd_app_2f1c…"] },
      session_id: { ...uuid, description: "This device's session, as it appears in `/me`." },
      expires_at: {
        type: "string",
        format: "date-time",
        description: "Slides forward on every authenticated call (90 days of inactivity).",
      },
      agent: { $ref: "#/components/schemas/Agent" },
      workspace: {
        type: "object",
        properties: { slug: { type: "string" }, name: { type: "string" } },
      },
    },
    required: ["token", "expires_at", "agent"],
  },
  Me: {
    type: "object",
    properties: {
      agent: { $ref: "#/components/schemas/Agent" },
      teams: { type: "array", items: { $ref: "#/components/schemas/Team" } },
      workspace: {
        type: "object",
        properties: {
          slug: { type: "string" },
          name: { type: "string" },
          locale: { type: "string" },
          timezone: { type: "string" },
        },
      },
      session: { type: "object", properties: { id: uuid } },
    },
  },
  PushDevice: {
    type: "object",
    description: "A push registration. The APNs/FCM token itself is never returned.",
    properties: {
      id: uuid,
      platform: { type: "string", enum: ["ios", "android"] },
      device_name: { type: "string", nullable: true },
      app_version: { type: "string", nullable: true },
      agent_id: { ...uuid, nullable: true },
      contact_id: { ...uuid, nullable: true },
      created_at: dateTime,
      last_seen_at: dateTime,
    },
  },
  WrittenMessage: {
    type: "object",
    description: "What a POST to a thread answers: the message, and what became of its files.",
    properties: {
      id: uuid,
      ticket_number: { type: "integer" },
      internal: { type: "boolean" },
      created_at: dateTime,
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: uuid,
            filename: { type: "string" },
            content_type: { type: "string" },
            size_bytes: { type: "integer" },
            download_url: { type: "string" },
          },
        },
      },
      skipped_files: {
        type: "array",
        items: { type: "string" },
        description: "Present only when storage refused a file — it names which.",
      },
    },
  },
  NotificationFeed: {
    type: "object",
    description:
      "Derived from tickets and messages, never stored — which is why `read` is a waterline and not a per-item flag.",
    properties: {
      data: { type: "array", items: { $ref: "#/components/schemas/Notification" } },
      unread_count: { type: "integer" },
      read_at: {
        type: "string",
        format: "date-time",
        nullable: true,
        description: "Everything older than this counts as read. Null when nothing has been read.",
      },
    },
    required: ["data", "unread_count", "read_at"],
  },
  Notification: {
    type: "object",
    properties: {
      id: { type: "string", description: "Stable for as long as the fact behind it is." },
      kind: {
        type: "string",
        enum: ["sla_breached", "sla_warning", "customer_reply", "internal_note"],
        description:
          'No "assigned to you": an assignment leaves no date behind, so a derived feed has nothing to sort. That one is a push notification, sent when it happens.',
      },
      ticket_number: { type: "integer" },
      ticket_subject: { type: "string" },
      actor_name: { type: "string", nullable: true },
      at: { type: "string", format: "date-time" },
      read: { type: "boolean" },
    },
  },
  PortalNotificationFeed: {
    type: "object",
    properties: {
      data: { type: "array", items: { $ref: "#/components/schemas/PortalNotification" } },
      unread_count: { type: "integer" },
      read_at: { type: "string", format: "date-time", nullable: true },
    },
    required: ["data", "unread_count", "read_at"],
  },
  PortalNotification: {
    type: "object",
    properties: {
      id: { type: "string" },
      kind: {
        type: "string",
        enum: ["agent_reply", "resolved"],
        description:
          "Somebody answered, or the request was resolved. Their own messages are not news to them.",
      },
      request_number: { type: "integer" },
      request_subject: { type: "string" },
      actor_name: { type: "string", nullable: true },
      at: { type: "string", format: "date-time" },
      read: { type: "boolean" },
    },
  },
  ReadReceipt: {
    type: "object",
    properties: {
      read_at: { type: "string", format: "date-time" },
      unread_count: { type: "integer", examples: [0] },
    },
  },
  PortalSession: {
    type: "object",
    description:
      "The result of a customer signing in on a device. `token` is shown once — store it in the platform keychain.",
    properties: {
      token: { type: "string", examples: ["ohd_ptl_9d3a…"] },
      session_id: uuid,
      expires_at: { type: "string", format: "date-time" },
      contact: { $ref: "#/components/schemas/PortalContact" },
      workspace: {
        type: "object",
        properties: { slug: { type: "string" }, name: { type: "string" } },
      },
    },
    required: ["token", "expires_at", "contact"],
  },
  PortalContact: {
    type: "object",
    description: "A customer, as they may see themselves — never the notes a workspace keeps about them.",
    properties: {
      id: uuid,
      email: { type: "string", format: "email" },
      name: { type: "string", nullable: true },
      locale: { type: "string", nullable: true, description: "Stored, but the workspace's own language is what the product renders." },
      organization: {
        type: "object",
        nullable: true,
        properties: {
          id: uuid,
          name: { type: "string" },
          shared_tickets: {
            type: "boolean",
            description: "True when the company's requests are visible to its members.",
          },
        },
      },
    },
  },
  PortalMe: {
    type: "object",
    properties: {
      contact: { $ref: "#/components/schemas/PortalContact" },
      workspace: {
        type: "object",
        properties: {
          slug: { type: "string" },
          name: { type: "string" },
          locale: {
            type: "string",
            description: "The language to render in — one per workspace, not per person.",
          },
        },
      },
      session: { type: "object", properties: { id: uuid } },
    },
  },
  PortalRequest: {
    type: "object",
    description: "One line of \"My requests\" (MC-01).",
    properties: {
      number: { type: "integer", examples: [4821] },
      subject: { type: "string" },
      status: { type: "string", enum: ["new", "open", "waiting", "on_hold", "resolved", "closed"] },
      created_at: dateTime,
      updated_at: dateTime,
      resolved_at: dateTime,
      closed_at: dateTime,
      message_count: { type: "integer" },
      last_message: {
        type: "object",
        nullable: true,
        description: "Who spoke last, which is what the row says: \"Marie replied 3 hrs ago\".",
        properties: {
          author_type: { type: "string", enum: ["agent", "contact", "system"] },
          author_name: { type: "string", nullable: true },
          created_at: dateTime,
        },
      },
    },
  },
  PortalMessage: {
    type: "object",
    description: "A public reply. Internal notes are never part of this collection.",
    properties: {
      id: uuid,
      author_type: { type: "string", enum: ["agent", "contact", "system"] },
      author_name: { type: "string", nullable: true },
      body_text: { type: "string", nullable: true },
      body_html: { type: "string", nullable: true },
      created_at: dateTime,
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: uuid,
            filename: { type: "string" },
            size_bytes: { type: "integer" },
            download_url: { type: "string", description: "Fetch with the same session token." },
          },
        },
      },
    },
  },
  PortalRequestDetail: {
    type: "object",
    properties: {
      number: { type: "integer" },
      subject: { type: "string" },
      status: { type: "string" },
      type: { type: "string", nullable: true },
      created_at: dateTime,
      updated_at: dateTime,
      resolved_at: dateTime,
      closed_at: dateTime,
      messages: { type: "array", items: { $ref: "#/components/schemas/PortalMessage" } },
    },
  },
  SearchResults: {
    type: "object",
    description: "A few top matches per kind — this answers \"take me to it\", not \"list them all\".",
    properties: {
      tickets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "integer" },
            subject: { type: "string" },
            status: { type: "string" },
          },
        },
      },
      contacts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: uuid,
            name: { type: "string", nullable: true },
            email: { type: "string", format: "email" },
            organization_name: { type: "string", nullable: true },
          },
        },
      },
      organizations: {
        type: "array",
        items: { type: "object", properties: { id: uuid, name: { type: "string" } } },
      },
      articles: {
        type: "array",
        description: "Drafts only for an agent session whose role manages the workspace.",
        items: {
          type: "object",
          properties: {
            id: uuid,
            title: { type: "string" },
            status: { type: "string" },
            view_count: { type: "integer" },
          },
        },
      },
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
                  requester_email: { type: "string", format: "email", examples: ["julien.lambert@nordfil.fr"] },
                  requester_name: { type: "string", examples: ["Julien Lambert"] },
                  subject: { type: "string", maxLength: 500, examples: ["Cannot export invoices as PDF"] },
                  message: { type: "string", examples: ["Hello, the PDF export has been failing since this morning."] },
                  priority: { type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal" },
                  organization_id: uuid,
                  tags: { type: "array", items: { type: "string" }, maxItems: 30 },
                  custom_fields: jsonObject,
                },
              },
            },
            "multipart/form-data": withFiles(
              {
                requester_email: { type: "string", format: "email" },
                requester_name: { type: "string" },
                subject: { type: "string", maxLength: 500 },
                message: { type: "string" },
                priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                organization_id: uuid,
                tags: {
                  type: "string",
                  description: "Comma-separated here — a form field cannot carry an array.",
                },
              },
              ["requester_email", "subject", "message"],
            ),
          },
        },
        responses: { 201: ok("Ticket", "The ticket as created, with the files stored."), ...ERRORS },
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
                  body: { type: "string", examples: ["We have shipped a fix — could you try again?"] },
                  internal: { type: "boolean", default: false },
                  agent_id: { ...uuid, description: "The agent the message is attributed to." },
                },
              },
            },
            "multipart/form-data": withFiles(
              {
                body: { type: "string" },
                internal: { type: "string", enum: ["true", "false"] },
                agent_id: uuid,
              },
              ["body"],
            ),
          },
        },
        responses: { 201: ok("WrittenMessage", "The message, and the files stored with it."), ...ERRORS },
      },
    },
    "/tickets/{number}/read": {
      parameters: [pathParam("number", { type: "integer" }, "The ticket number.")],
      post: {
        tags: ["Mobile"],
        summary: "Mark a ticket read",
        description: [
          "Clears the unread dot for the calling agent, and for them alone — a colleague",
          "opening the ticket does not clear mine.",
          "",
          "Explicit rather than implied by `GET /tickets/{number}`: a read that happens as a",
          "side effect of fetching cannot be retried, prefetched or cached, and a client",
          "fetches a ticket for reasons other than a human reading it.",
        ].join("\n"),
        security: [{ ApiKey: ["write"] }],
        responses: {
          200: {
            description: "Marked read.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    number: { type: "integer" },
                    read_at: { type: "string", format: "date-time" },
                    unread: { type: "boolean", examples: [false] },
                  },
                },
              },
            },
          },
          ...ERRORS,
        },
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
                  email: { type: "string", format: "email", examples: ["julien.lambert@nordfil.fr"] },
                  name: { type: "string", examples: ["Julien Lambert"] },
                  phone: { type: "string", examples: ["+33 1 23 45 67 89"] },
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
                  name: { type: "string", maxLength: 200, examples: ["Nordfil SAS"] },
                  email_domains: {
                    type: "array",
                    items: { type: "string", examples: ["nordfil.fr"] },
                    maxItems: 50,
                  },
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
                  title: { type: "string", maxLength: 300, examples: ["Exporting your invoices"] },
                  category_id: uuid,
                  body_html: { type: "string", examples: ["<p>Open <strong>Billing</strong>, then…</p>"] },
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

    /* ----- Mobile app: signing in on a device, then being one ----- */

    "/auth/login": {
      post: {
        tags: ["Mobile"],
        summary: "Sign in on a device",
        description: [
          "Exchanges an agent's credentials for a token bound to this phone, revocable on",
          "its own. Call it on the workspace's own address (`{slug}.$BASE_DOMAIN`): the",
          "workspace comes from the host, never from the body.",
          "",
          "Unauthenticated, so it is limited separately — ten attempts per address and forty",
          "per source every five minutes.",
        ].join("\n"),
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", examples: ["sarah@acme.fr"] },
                  password: { type: "string", format: "password" },
                  device: {
                    type: "object",
                    description: "For the session list — a label, never an identity.",
                    properties: {
                      name: { type: "string", examples: ["Sarah's iPhone"] },
                      platform: { type: "string", enum: ["ios", "android"] },
                      app_version: { type: "string", examples: ["1.0.0 (42)"] },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: ok("Session", "Signed in."),
          400: { $ref: "#/components/responses/BadRequest" },
          401: errorRef("Wrong email or password."),
          403: errorRef("Not an agent of this workspace, or the address is unconfirmed."),
          404: errorRef("No workspace at this address."),
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/auth/authorize": {
      get: {
        tags: ["Mobile"],
        summary: "Start an SSO sign-in from the app",
        description: [
          "The browser leg of a single sign-on. Open the workspace's login page in a system",
          "browser with `?next=/api/v1/auth/authorize?code_challenge=…`; once the identity",
          "provider has signed the agent in, this route redirects to the app's URL scheme",
          "carrying a one-time code, which the app spends on `/auth/exchange`.",
          "",
          "The destination is the scheme configured on the instance — there is no",
          "`redirect_uri` parameter, by design. PKCE S256 is required: a custom scheme is not",
          "exclusive to one installed app.",
        ].join("\n"),
        security: [],
        parameters: [
          {
            name: "code_challenge",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 43, maxLength: 43 },
            description: "base64url(SHA-256(verifier)).",
          },
          {
            name: "state",
            in: "query",
            schema: { type: "string", maxLength: 128 },
            description: "Echoed back untouched.",
          },
        ],
        responses: {
          303: {
            description:
              "Redirect to `openhelpdesk://auth?code=…`, or to the login page when the browser has no session yet.",
          },
          400: errorRef("The challenge is missing or is not S256."),
        },
      },
    },
    "/auth/exchange": {
      post: {
        tags: ["Mobile"],
        summary: "Finish an SSO sign-in",
        description:
          "Trades the one-time code for a device session. Single use, two minutes, and worthless without the verifier the app kept.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code", "code_verifier"],
                properties: {
                  code: { type: "string" },
                  code_verifier: { type: "string", minLength: 43, maxLength: 128 },
                  device: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      platform: { type: "string", enum: ["ios", "android"] },
                      app_version: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: ok("Session", "Signed in."),
          400: { $ref: "#/components/responses/BadRequest" },
          401: errorRef("The code is expired, already spent, or the verifier does not match."),
          403: errorRef("The workspace is suspended, or the account is no longer an agent."),
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Mobile"],
        summary: "Sign this device out",
        description:
          "Revokes the session the call is made with, and its push registrations. Other devices and browser sessions are untouched.",
        security: [{ ApiKey: ["read"] }],
        responses: { 204: { description: "Signed out." }, ...ERRORS },
      },
    },
    "/me": {
      get: {
        tags: ["Mobile"],
        summary: "The agent this device is signed in as",
        description:
          'Identity, role and teams — what "my tickets" and the view switcher are built from. Needs an agent session: a workspace API key has nobody behind it and gets 403 `agent_required`.',
        security: [{ ApiKey: ["read"] }],
        responses: { 200: ok("Me"), ...ERRORS },
      },
      patch: {
        tags: ["Mobile"],
        summary: "Take work, or stop taking work",
        description: [
          "`available` is the only writable field, and it is not cosmetic: round-robin",
          "assignment only ever picks an available agent, so turning it off on the way into a",
          "meeting is how a queue stops filling up for somebody who cannot answer.",
          "",
          "A name, an email or a role are the workspace's business. An endpoint called `/me`",
          "that could change a role would be a privilege escalation with a friendly name.",
        ].join("\n"),
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["available"],
                properties: { available: { type: "boolean" } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "The agent as updated.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { agent: { $ref: "#/components/schemas/Agent" } },
                },
              },
            },
          },
          ...ERRORS,
        },
      },
    },
    "/devices": {
      post: {
        tags: ["Mobile"],
        summary: "Register for push notifications",
        description:
          "Upsert on the token: the operating system rotates and reissues it, so re-registering updates the row instead of leaving a trail of them.",
        security: [{ ApiKey: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["push_token", "platform"],
                properties: {
                  push_token: { type: "string", maxLength: 512, description: "APNs or FCM token." },
                  platform: { type: "string", enum: ["ios", "android"] },
                  device_name: { type: "string" },
                  app_version: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 201: ok("PushDevice", "Registered."), ...ERRORS },
      },
    },
    "/devices/{id}": {
      parameters: [pathParam("id", uuid, "The registration id.")],
      delete: {
        tags: ["Mobile"],
        summary: "Stop notifying this device",
        description: "An agent revokes their own registrations; a device is not workspace furniture.",
        security: [{ ApiKey: ["write"] }],
        responses: { 204: { description: "Revoked." }, ...ERRORS },
      },
    },
    /* ----- Customer app: a person's own requests, and nothing else ----- */

    "/portal/auth/request-link": {
      post: {
        tags: ["Customer app"],
        summary: "Email a customer their sign-in link",
        description: [
          "Customers have no password — the portal signs them in by emailed link, and the app",
          "uses the same one. The link lands in a browser, which hands the session to the app",
          "through `/portal/auth/handoff`, so generate a PKCE verifier first and pass its",
          "challenge here: it is what the handover code will be bound to.",
          "",
          "Always 202. An address with no account, a blocked one and a real one are",
          "indistinguishable in the answer — anything else would turn this into a directory of",
          "a workspace's customers.",
        ].join("\n"),
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "code_challenge"],
                properties: {
                  email: { type: "string", format: "email" },
                  code_challenge: {
                    type: "string",
                    minLength: 43,
                    maxLength: 43,
                    description: "base64url(SHA-256(verifier)).",
                  },
                },
              },
            },
          },
        },
        responses: {
          202: {
            description: "The link is on its way, if that address can receive one.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { sent: { type: "boolean" }, email: { type: "string" } },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: errorRef("No workspace at this address, or its portal is switched off."),
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/portal/auth/handoff": {
      get: {
        tags: ["Customer app"],
        summary: "Hand an emailed sign-in over to the app",
        description:
          "Where the magic link ends up. With the portal cookie the browser just received, it redirects to the app's URL scheme carrying a one-time code. Not called by the app itself — the app waits for the deep link.",
        security: [],
        parameters: [
          {
            name: "code_challenge",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 43, maxLength: 43 },
            description: "The challenge the link was built with.",
          },
          { name: "state", in: "query", schema: { type: "string", maxLength: 128 } },
        ],
        responses: {
          303: { description: "Redirect to `openhelpdesk://portal-auth?code=…`." },
          400: errorRef("The challenge is missing or is not S256."),
          401: errorRef("The link expired or was already used."),
          404: errorRef("This workspace serves no customer portal."),
        },
      },
    },
    "/portal/auth/exchange": {
      post: {
        tags: ["Customer app"],
        summary: "Finish a customer sign-in",
        description: "Trades the handover code for a session bound to this phone. Single use, two minutes.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code", "code_verifier"],
                properties: {
                  code: { type: "string" },
                  code_verifier: { type: "string", minLength: 43, maxLength: 128 },
                  device: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      platform: { type: "string", enum: ["ios", "android"] },
                      app_version: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: ok("PortalSession", "Signed in."),
          400: { $ref: "#/components/responses/BadRequest" },
          401: errorRef("The code is expired, already spent, or the verifier does not match."),
          403: errorRef("This address cannot sign in to this workspace."),
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/portal/auth/logout": {
      post: {
        tags: ["Customer app"],
        summary: "Sign this device out",
        security: [{ PortalSession: [] }],
        responses: { 204: { description: "Signed out." }, ...ERRORS },
      },
    },
    "/portal/me": {
      get: {
        tags: ["Customer app"],
        summary: "The customer this device is signed in as",
        description:
          "Identity and organization (MC-05). `workspace.locale` is the language to render in: the product runs one language per workspace, so there is deliberately no per-customer language to write.",
        security: [{ PortalSession: [] }],
        responses: { 200: ok("PortalMe"), ...ERRORS },
      },
    },
    "/portal/requests": {
      get: {
        tags: ["Customer app"],
        summary: "The requests a customer may see",
        description:
          "`scope=mine` is theirs; `scope=organization` is their company's, and only where that company has ticket sharing turned on. The fifty most recently updated, unpaginated — `next_cursor` is always null.",
        security: [{ PortalSession: [] }],
        parameters: [
          {
            name: "scope",
            in: "query",
            schema: { type: "string", enum: ["mine", "organization"], default: "mine" },
          },
        ],
        responses: { 200: okList("PortalRequest", "The customer's requests."), ...ERRORS },
      },
      post: {
        tags: ["Customer app"],
        summary: "Submit a request",
        description:
          "Files the request on the `portal` channel and runs the same rules, SLA policies and notifications as the web portal — a request typed on a phone is not a second kind of request.",
        security: [{ PortalSession: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["subject", "body"],
                properties: {
                  subject: { type: "string", maxLength: 500 },
                  body: { type: "string" },
                  urgency: {
                    type: "string",
                    enum: ["low", "normal", "high"],
                    default: "normal",
                    description:
                      "The customer's own word for it. It stops at high: a field on which anyone can declare their request the most urgent teaches agents to ignore it.",
                  },
                },
              },
            },
            "multipart/form-data": withFiles(
              {
                subject: { type: "string", maxLength: 500 },
                body: { type: "string" },
                urgency: { type: "string", enum: ["low", "normal", "high"] },
              },
              ["subject", "body"],
            ),
          },
        },
        responses: {
          ...ERRORS,
          201: ok("PortalRequestDetail", "The request as filed."),
          403: errorRef("This workspace is not accepting new requests."),
        },
      },
    },
    "/portal/requests/{number}": {
      parameters: [pathParam("number", { type: "integer" }, "The request number.")],
      get: {
        tags: ["Customer app"],
        summary: "Read a request and its conversation",
        description:
          "Public replies only — internal notes are excluded by the query itself. A request that is not the customer's answers 404, never 403: otherwise the numbers become a way to count a workspace's tickets.",
        security: [{ PortalSession: [] }],
        responses: { 200: ok("PortalRequestDetail"), ...ERRORS },
      },
    },
    "/portal/requests/{number}/messages": {
      parameters: [pathParam("number", { type: "integer" }, "The request number.")],
      post: {
        tags: ["Customer app"],
        summary: "Answer on your own request",
        description:
          "Only the requester may write; a colleague who can read the company's requests cannot answer in their thread. A reply reopens what was waiting, on hold or resolved.",
        security: [{ PortalSession: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: { body: { type: "string" } },
              },
            },
            "multipart/form-data": withFiles({ body: { type: "string" } }, ["body"]),
          },
        },
        responses: {
          ...ERRORS,
          201: ok("PortalMessage", "The message as written."),
          403: errorRef("This workspace is not accepting messages."),
        },
      },
    },
    "/portal/devices": {
      post: {
        tags: ["Customer app"],
        summary: "Register for push notifications",
        description: "Upsert on the token, like the agents' registrations.",
        security: [{ PortalSession: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["push_token", "platform"],
                properties: {
                  push_token: { type: "string", maxLength: 512 },
                  platform: { type: "string", enum: ["ios", "android"] },
                  device_name: { type: "string" },
                  app_version: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 201: ok("PushDevice", "Registered."), ...ERRORS },
      },
    },
    "/portal/devices/{id}": {
      parameters: [pathParam("id", uuid, "The registration id.")],
      delete: {
        tags: ["Customer app"],
        summary: "Stop notifying this device",
        security: [{ PortalSession: [] }],
        responses: { 204: { description: "Revoked." }, ...ERRORS },
      },
    },
    "/portal/notifications": {
      get: {
        tags: ["Customer app"],
        summary: "News about my requests",
        description:
          "Somebody answered, or a request was resolved (MC-04). Nothing about a colleague's request: belonging to an organization that shares its tickets lets someone read them, which is not being notified about them.",
        security: [{ PortalSession: [] }],
        responses: { 200: ok("PortalNotificationFeed"), ...ERRORS },
      },
    },
    "/portal/notifications/read": {
      post: {
        tags: ["Customer app"],
        summary: "Mark everything read",
        security: [{ PortalSession: [] }],
        responses: { 200: ok("ReadReceipt"), ...ERRORS },
      },
    },

    "/notifications": {
      get: {
        tags: ["Mobile"],
        summary: "What happened on my tickets while I was away",
        description: [
          "The same feed the web topbar shows, as data rather than as sentences — a phone",
          "writes its own wording, in the language of the phone.",
          "",
          "`read` is not per item and cannot be: the feed is derived from tickets and messages,",
          "so there is no row to mark. It is a waterline (see POST /notifications/read).",
        ].join("\n"),
        security: [{ ApiKey: ["read"] }],
        responses: { 200: ok("NotificationFeed"), ...ERRORS },
      },
    },
    "/notifications/read": {
      post: {
        tags: ["Mobile"],
        summary: "Mark everything read",
        description:
          "Moves the waterline to now. Shared with the web topbar's own button, so clearing the badge on a phone clears it in the browser too.",
        security: [{ ApiKey: ["write"] }],
        responses: { 200: ok("ReadReceipt"), ...ERRORS },
      },
    },
    "/search": {
      get: {
        tags: ["Mobile"],
        summary: "Search tickets, contacts, organizations and articles",
        description:
          "One query across four collections, as the search box offers it. A few top matches per kind, no pagination — page `/tickets` with real filters to walk a set.",
        security: [{ ApiKey: ["read"] }],
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 2 },
            description: "A ticket number, a subject, a name, an address. Under two characters, every list comes back empty.",
          },
        ],
        responses: { 200: ok("SearchResults"), ...ERRORS },
      },
    },
  };
}

/* ---------- The document ---------- */

export function openApiDocument(origin: string, extraServers: string[] = []) {
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
        "The mobile app authenticates differently, and the **Mobile** section says how: an",
        "agent signs in on a phone (`POST /auth/login`) and gets a token bound to that",
        "device, which their role — not a scope list — decides the reach of. A phone cannot",
        "carry a workspace key: it would be shared with every integration, and unable to say",
        "whose tickets these are.",
        "",
        "**Customer app** is the third credential and the narrowest surface: a customer signs",
        "in by emailed link and may read and answer their own requests, under `/portal`. It is",
        "a separate namespace on purpose — the answer a customer is owed is narrow, and that",
        "is easier to guarantee by routing than by filtering.",
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
        "600 requests per minute per key or device session. Over it, `429` with a `Retry-After`",
        "header. Signing in is tighter, and counted per address and per source: see",
        "`POST /auth/login`.",
      ].join("\n"),
      license: { name: "AGPL-3.0-only", identifier: "AGPL-3.0-only" },
    },
    servers: [
      /*
       * A templated host when the caller asks for one.
       *
       * The documentation site is served from a domain of its own, so it cannot
       * infer which workspace a reader belongs to. Declaring `workspace` as a
       * server variable lets the reference's playground offer a field instead of
       * a wrong default — and OpenAPI requires the declaration, without which
       * `{workspace}` is just a broken URL.
       */
      origin.includes("{workspace}")
        ? {
            url: `${origin}/api/v1`,
            description: "Your workspace.",
            variables: {
              workspace: {
                default: "acme",
                description: "The subdomain of your workspace.",
              },
            },
          }
        : { url: `${origin}/api/v1`, description: "This workspace." },
      /*
       * Extra servers the caller wants offered — a local instance while writing
       * the documentation, so the reference's "Test" button hits something that
       * exists instead of a production host nobody has a key for.
       */
      ...extraServers.map((url) => ({ url: `${url}/api/v1`, description: "Local instance." })),
    ],
    tags: [
      { name: "Tickets", description: "Requests, their conversations and their files." },
      { name: "Contacts", description: "The people who write in." },
      { name: "Organizations", description: "The companies they belong to." },
      { name: "Knowledge base", description: "Help centre categories and articles." },
      { name: "Attachments", description: "Files exchanged on tickets." },
      { name: "Workspace", description: "Agents, teams and the configuration rules run on." },
      {
        name: "Mobile",
        description:
          "Signing in on a phone, and what only a signed-in phone can ask: who am I, notify me, search.",
      },
      {
        name: "Customer app",
        description:
          "What a customer may do with their own requests. A namespace of its own, not the agent routes with a narrower credential.",
      },
    ],
    paths: buildPaths(),
    components: {
      securitySchemes: {
        ApiKey: {
          type: "http",
          scheme: "bearer",
          description:
            "`Authorization: Bearer ohd_live_…`. A key carries scopes: `read`, `write`, " +
            "`ticket:create`. A key without the scope a route needs gets 403, not 401.\n\n" +
            "A device session token (`ohd_app_…`, from `POST /auth/login`) goes in the same " +
            "header and opens the same routes, with what the agent's role carries instead of " +
            "scopes chosen at minting. It is also the only credential `/me` and `/devices` " +
            "accept: they are about a person, and a key is not one.",
        },
        PortalSession: {
          type: "http",
          scheme: "bearer",
          description:
            "`Authorization: Bearer ohd_ptl_…`, from `POST /portal/auth/exchange`. It opens the " +
            "`/portal` endpoints and only those: a customer session is not a smaller API key, " +
            "it is a different surface. Presented to an agent route it gets 403 " +
            "`portal_session`; an agent credential presented to a `/portal` route gets 403 " +
            "`agent_credential`.",
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
