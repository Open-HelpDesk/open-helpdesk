import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { PortalShell, type ShellTab } from "@/components/desk/portal/shell";
import { BrandMark } from "@/components/desk/portal/brand-mark";
import { deskSignOut } from "../login/actions";
import { getDeskViewer } from "../session";

/**
 * Employee portal chrome. Not signed in → the magic-link sign-in. Signed in as
 * a contact with no person behind it (a customer) → a plain explanation, not
 * the catalogue. Tabs depend on the role: Catalogue and My access for everyone,
 * plus Approvals and History for whoever approves (spec 19 §6).
 */
export default async function DeskPortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getDeskViewer();
  if (viewer.kind === "anonymous") redirect("/desk/login");
  const t = await getT();

  if (viewer.kind === "not_employee") {
    return (
      <div className="grid min-h-screen place-items-center px-4 py-14">
        <div className="sd-card sd-rise flex w-[460px] max-w-full flex-col items-center gap-4 p-7 text-center" style={{ borderRadius: 18 }}>
          <div className="flex items-center gap-2.5">
            <BrandMark size={24} />
            <span className="sd-title text-[17px]">{viewer.tenantName}</span>
          </div>
          <h1 className="sd-title text-[22px] leading-tight">{t("desk.portal.notEmployee.title")}</h1>
          <p className="text-[14.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
            {t("desk.portal.notEmployee.body", { email: viewer.email })}
          </p>
          <form action={deskSignOut}>
            <button type="submit" className="sd-btn sd-btn-ghost">
              {t("desk.portal.notEmployee.other")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { person } = viewer;
  const tabs: ShellTab[] = [
    { href: "/desk", label: t("desk.portal.tab.catalogue"), count: 0 },
    { href: "/desk/mine", label: t("desk.portal.tab.mine"), count: person.openRequests },
  ];
  if (viewer.isApprover) {
    tabs.push(
      { href: "/desk/approvals", label: t("desk.portal.tab.approvals"), count: person.pendingApprovals },
      { href: "/desk/history", label: t("desk.portal.tab.history"), count: 0 },
    );
  }
  const subtitle = [person.title, person.department].filter(Boolean).join(" · ");

  return (
    <PortalShell
      tenantName={viewer.tenantName}
      person={{ name: person.name, email: person.email, subtitle }}
      tabs={tabs}
      signOut={deskSignOut}
    >
      {children}
    </PortalShell>
  );
}
