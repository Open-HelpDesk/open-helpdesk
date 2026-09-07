#!/usr/bin/env node
/**
 * The MCP server over stdio — what Claude Desktop, Claude Code and the other
 * local clients speak.
 *
 * Configured entirely by environment, because that is all a client config can
 * pass:
 *
 *   OHD_BASE_URL   https://acme.open-helpdesk.com
 *   OHD_API_KEY    ohd_live_…
 *
 * Nothing is logged to stdout, ever: stdout *is* the protocol. Diagnostics go
 * to stderr, which clients surface in their logs.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

const baseUrl = process.env["OHD_BASE_URL"];
const apiKey = process.env["OHD_API_KEY"];

if (!baseUrl || !apiKey) {
  console.error(
    "open-helpdesk-mcp: set OHD_BASE_URL (e.g. https://acme.open-helpdesk.com) " +
      "and OHD_API_KEY (Settings → API & webhooks).",
  );
  process.exit(1);
}

const server = createServer({ baseUrl, apiKey });
await server.connect(new StdioServerTransport());
console.error(`open-helpdesk-mcp: connected to ${baseUrl}`);
