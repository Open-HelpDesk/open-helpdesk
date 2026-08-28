import { notFound } from "next/navigation";
import { and, asc, count, eq, gte } from "drizzle-orm";
import {
  contacts,
  db,
  orgAdminGrants,
  orgSsoConnections,
  organizations,
  ssoAuthEvents,
  verifiedDomains,
} from "@openhelpdesk/db";
import { getEdition } from "@openhelpdesk/config";
import { requireAgent } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";
import { getT } from "@/i18n/server";
import { LockedScreen, PageHeader, PageShell, SubCrumb } from "@/components/settings-page";
import { OrgSsoDetail } from "./page";

/**
 * ST-14b — One organisation's SSO delegation, read-only.
 *
 * A page rather than the drawer it used to be: the mockup gives it a breadcrumb,
 * and the panel it replaces was showing a full connection record — protocol,
 * domains, admin, sign-in activity — through a 420 px slot.
 */
const DAY = 24 * 60 * 60 * 1000;

export default async function CustomerSsoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { id } = await params;

  // Same gate as the list, and through the same entitlement: a deep link must
  // not be the way around a licence check.
  if (!entitlementsFor(tenant).customerSso) {
    const edition = getEdition();
    return (
      <PageShell>
        <PageHeader
          title={t("app.settings.sso.customerTitle")}
          subtitle={t("app.settings.sso.customerSubtitle")}
        />
        <LockedScreen
          variant={edition}
          title={t(
            edition === "cloud"
              ? "app.settings.sso.customerLockedTitle"
              : "app.settings.shell.eeSelfHostedTitle",
          )}
          text={t(
            edition === "cloud"
              ? "app.settings.sso.customerLockedText"
              : "app.settings.shell.eeSelfHostedText",
          )}
          ghost={null}
        />
      </PageShell>
    );
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.tenantId, tenant.id), eq(organizations.id, id)));
  if (!org) notFound();

  const since = new Date(Date.now() - DAY);
  const [connection, domains, grant, failures] = await Promise.all([
    db
      .select()
      .from(orgSsoConnections)
      .where(
        and(eq(orgSsoConnections.tenantId, tenant.id), eq(orgSsoConnections.organizationId, id)),
      )
      .then((rows) => rows[0]),
    db
      .select()
      .from(verifiedDomains)
      .where(and(eq(verifiedDomains.tenantId, tenant.id), eq(verifiedDomains.organizationId, id)))
      .orderBy(asc(verifiedDomains.domain)),
    db
      .select({ contactName: contacts.name, contactEmail: contacts.email })
      .from(orgAdminGrants)
      .innerJoin(contacts, eq(orgAdminGrants.contactId, contacts.id))
      .where(and(eq(orgAdminGrants.tenantId, tenant.id), eq(orgAdminGrants.organizationId, id)))
      .then((rows) => rows[0]),
    db
      .select({ n: count() })
      .from(ssoAuthEvents)
      .where(
        and(
          eq(ssoAuthEvents.tenantId, tenant.id),
          eq(ssoAuthEvents.organizationId, id),
          eq(ssoAuthEvents.result, "failure"),
          gte(ssoAuthEvents.createdAt, since),
        ),
      )
      .then((rows) => rows[0]?.n ?? 0),
  ]);

  return (
    <PageShell>
      <SubCrumb
        parent={t("app.settings.sso.customerTitle")}
        href="/app/settings/customer-sso"
        current={org.name}
      />
      <PageHeader
        title={t("app.settings.sso.drawerTitle", { name: org.name })}
        subtitle={t("app.settings.sso.customerSubtitle")}
      />
      <div className="st-rise">
        <OrgSsoDetail
          t={t}
          org={org.name}
          connection={connection}
          domains={domains}
          admin={grant ?? null}
          failures24h={failures}
        />
      </div>
    </PageShell>
  );
}
