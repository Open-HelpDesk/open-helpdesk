# @openhelpdesk/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for an Open
HelpDesk workspace: search tickets, read a thread, look up the knowledge base,
and — when asked — answer.

## Why it goes through the REST API

It calls the public API, never the database. An assistant therefore inherits the
API key's scopes, its rate limit and its workspace isolation, and cannot reach
round the rules engine. The same server works against the hosted product and
against a self-hosted instance, with nothing but a URL and a key.

## Running it

```bash
OHD_BASE_URL=https://acme.open-helpdesk.com \
OHD_API_KEY=ohd_live_… \
pnpm --filter @openhelpdesk/mcp run start
```

Stdout is the protocol; everything the server has to say goes to stderr.

## The tools

Nine, chosen for what someone does with a helpdesk rather than one per endpoint.

**Reading** — `search_tickets`, `get_ticket`, `search_knowledge_base`,
`get_article`, `find_contact`, `list_workspace`.

**Writing** — `create_ticket`, `reply_to_ticket`, `update_ticket`. All three are
annotated as writes so a client can ask before running them.

`reply_to_ticket` defaults to an **internal note**. Drafting is the common case,
and sending to a customer should be the sentence someone typed, not the default
they forgot. `create_ticket` and a public reply both fire the workspace's rules
and reach a real person; their descriptions say so, because a client can only
warn about what it was told.

Nothing maps to `DELETE`, and nothing writes configuration.

## Layout

```
src/client.ts   the thin HTTP client, with paginated collection walking
src/server.ts   the tools
src/stdio.ts    the stdio entry point
```

Adding a transport means one more entry point beside `stdio.ts`; the tools do
not change.
