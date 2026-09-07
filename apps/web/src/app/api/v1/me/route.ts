/**
 * /api/v1/me — who this device is signed in as.
 *
 * "My tickets" is the first screen of the app (MA-01) and the API had no way to
 * say who "my" is: a workspace API key is not a person, and the tickets endpoint
 * filters on an `assignee_id` the app would have had to know already. This is
 * that missing answer — identity, role, and the teams whose queues the agent
 * belongs to.
 *
 * The role is here because the app draws with it: a Viewer gets no reply
 * composer, and finding that out from a 403 after typing is not a design.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, teamMembers, teams, users } from "@openhelpdesk/db";
import {
  apiError,
  apiJson,
  readJson,
  requireDeviceAgent,
  serializeAgent,
  serializeTeam,
  withApi,
} from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async (auth) => {
    const agent = requireDeviceAgent(auth);
    if (agent instanceof Response) return agent;

    const rows = await db
      .select({ team: teams })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(eq(teamMembers.tenantId, auth.tenant.id), eq(teamMembers.userId, agent.id)))
      .orderBy(asc(teams.name));

    return apiJson({
      agent: serializeAgent(agent),
      teams: rows.map((r) => serializeTeam(r.team)),
      workspace: {
        slug: auth.tenant.slug,
        name: auth.tenant.name,
        locale: auth.tenant.locale,
        timezone: auth.tenant.timezone,
      },
      session: { id: auth.keyId },
    });
  });
}

/**
 * The one thing an agent sets about themselves: whether they are taking work.
 *
 * "Available for assignment" is the switch on MA-07, and it is not cosmetic —
 * round-robin only ever hands a ticket to an available agent, so turning it off
 * on the way into a meeting is how a queue stops filling up for somebody who
 * cannot answer. It was readable over the API and settable nowhere, which made
 * the switch on the phone a switch with nothing behind it.
 *
 * Deliberately the only writable field. A name, a role or an email are the
 * workspace's business, and an endpoint called `/me` that could change a role
 * would be a privilege escalation with a friendly name.
 */
export async function PATCH(request: NextRequest) {
  return withApi(request, "write", async (auth) => {
    const agent = requireDeviceAgent(auth);
    if (agent instanceof Response) return agent;

    const body = await readJson(request);
    if (body instanceof Response) return body;
    if (typeof body.available !== "boolean") {
      return apiError(400, "invalid_body", "Provide `available` as a boolean.");
    }

    const [updated] = await db
      .update(users)
      .set({ available: body.available })
      .where(and(eq(users.tenantId, auth.tenant.id), eq(users.id, agent.id)))
      .returning();
    return apiJson({ agent: serializeAgent(updated ?? agent) });
  });
}
