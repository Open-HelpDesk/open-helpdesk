/**
 * /api/v1/portal/me — the customer this device is signed in as (MC-05).
 *
 * Identity, and the organization they belong to — which is what the account
 * screen shows, and what tells the app whether its "my company's requests" tab
 * exists at all.
 *
 * There is deliberately no way to write a language here. The product renders a
 * workspace in ONE language (see i18n/locales.ts: no per-user preference, no
 * content negotiation), and nothing reads `contacts.locale` to render anything.
 * A PATCH would have been a setting the product ignores — the exact defect this
 * codebase keeps finding. So `workspace.locale` is the language the app should
 * display on that row, read-only, and it is the truth.
 */
import type { NextRequest } from "next/server";
import { apiJson } from "@/lib/api";
import { contactOrganization } from "@/lib/portal-data";
import { serializePortalContact, withPortalApi } from "@/lib/portal-api";

export async function GET(request: NextRequest) {
  return withPortalApi(request, async ({ tenant, contact, sessionId }) => {
    return apiJson({
      contact: serializePortalContact(contact, await contactOrganization(tenant.id, contact.id)),
      workspace: { slug: tenant.slug, name: tenant.name, locale: tenant.locale },
      session: { id: sessionId },
    });
  });
}
