/**
 * /api/v1/search — the search box (MA-01, ⌘K on the web).
 *
 * One query across tickets, contacts, organizations and help-centre articles,
 * which is what the search icon in the app promises: an agent looking for
 * "#4831" or "Marie" does not first pick a resource to look in. The four
 * collections were reachable one at a time and only by exact filters, so the
 * mobile prototype's search icon had nothing to call.
 *
 * A few top matches per kind, no pagination: this answers "take me to the
 * thing", and a caller that wants the whole set of matching tickets should page
 * GET /tickets with the filters it means. Same query the web workspace uses, so
 * both find the same rows.
 */
import type { NextRequest } from "next/server";
import { apiJson, withApi } from "@/lib/api";
import { searchAll } from "@/lib/directory";
import { isManager } from "@/lib/session";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async (auth) => {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    // Below two characters every row matches, which is not a search result.
    // Empty rather than a 400: search-as-you-type reaches this state on the way
    // to a real query, and an error for a keystroke is noise.
    if (q.length < 2) {
      return apiJson({ tickets: [], contacts: [], organizations: [], articles: [] });
    }

    /*
     * Drafts surface only to whoever can open them, and that is a role — so a
     * workspace API key, which has no role, never sees them. Otherwise the
     * titles and audiences of unpublished articles would be readable through a
     * credential minted for a CRM integration.
     */
    const results = await searchAll(auth.tenant.id, q, auth.agent ? isManager(auth.agent.role) : false);

    return apiJson({
      tickets: results.tickets.map((t) => ({
        number: t.number,
        subject: t.subject,
        status: t.status,
      })),
      contacts: results.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        organization_name: c.organizationName,
      })),
      organizations: results.organizations.map((o) => ({ id: o.id, name: o.name })),
      articles: results.articles.map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        view_count: a.viewCount,
      })),
    });
  });
}
