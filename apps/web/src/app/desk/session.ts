/**
 * Who is using the employee portal (spec 19 §5.3).
 *
 * The employee signs in as a portal contact — the same magic-link session as
 * the customer portal, scoped to the tenant's subdomain — and the desk pairs
 * that contact with a person of the directory. A contact with no person behind
 * it is a customer: it gets a clear "not in the directory" page, never the
 * catalogue.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { getPortalContact } from "@/lib/portal-auth";
import { personForContact } from "@/lib/desk";
import { portalPerson, type PortalPerson } from "@/lib/desk/portal-data";

export type DeskViewer =
  | { kind: "anonymous" }
  | { kind: "not_employee"; email: string; tenantName: string }
  | {
      kind: "employee";
      tenantId: string;
      tenantName: string;
      person: PortalPerson;
      /** Manager tabs: direct reports, or approvals of their own (owner, finance, delegate). */
      isApprover: boolean;
    };

export const getDeskViewer = cache(async (): Promise<DeskViewer> => {
  const session = await getPortalContact();
  if (!session) return { kind: "anonymous" };
  const paired = await personForContact(session.tenant.id, session.contact.id);
  const person = paired ? await portalPerson(session.tenant.id, paired.id) : null;
  if (!person) {
    return { kind: "not_employee", email: session.contact.email, tenantName: session.tenant.name };
  }
  return {
    kind: "employee",
    tenantId: session.tenant.id,
    tenantName: session.tenant.name,
    person,
    isApprover:
      paired?.isManager === true ||
      person.reportCount > 0 ||
      person.pendingApprovals > 0 ||
      person.decisionCount > 0,
  };
});

/** For pages and actions: the employee, or a redirect to the sign-in. */
export async function requireEmployee() {
  const viewer = await getDeskViewer();
  if (viewer.kind !== "employee") redirect("/desk/login");
  return viewer;
}
