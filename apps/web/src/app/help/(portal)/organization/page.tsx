import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContact } from "@/lib/portal-auth";
import {
  getOrgAdminOrg,
  getOrgSsoConnection,
  listOrgDomains,
  listOrgMembers,
} from "@/lib/portal-data";
import { deFr, initialsFr, numberFr } from "../../portal-format";
import { DomainsSection } from "./domains-section";
import { MembersSection } from "./members-section";
import { SSO_PROVIDERS, SsoSection, type SsoProviderKey } from "./sso-section";

const TABS = [
  ["sso", "Connexion SSO"],
  ["domains", "Domaines"],
  ["members", "Collaborateurs"],
] as const;

/**
 * PT-08 — Administration de mon organisation. Réservé aux contacts porteurs d'un
 * orgAdminGrant (sinon redirection /help). Onglets Connexion SSO / Domaines /
 * Collaborateurs — domaines et collaborateurs fonctionnels, SSO en persistance minimale.
 */
export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; provider?: string; error?: string; domain?: string }>;
}) {
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const org = await getOrgAdminOrg(session.tenant.id, session.contact.id);
  if (!org) redirect("/help");

  const { tab: tabParam, provider: providerParam, error, domain } = await searchParams;
  const tab = TABS.some(([key]) => key === tabParam) ? tabParam! : "sso";

  const [members, domains, conn] = await Promise.all([
    listOrgMembers(session.tenant.id, org.id),
    listOrgDomains(session.tenant.id, org.id),
    getOrgSsoConnection(session.tenant.id, org.id),
  ]);

  const provider: SsoProviderKey = SSO_PROVIDERS.some((p) => p.key === providerParam)
    ? (providerParam as SsoProviderKey)
    : ((conn?.provider as SsoProviderKey | undefined) ?? "entra");
  const providerName = SSO_PROVIDERS.find((p) => p.key === conn?.provider)?.name ?? null;
  const verifiedDomainNames = domains.filter((d) => d.status === "verified").map((d) => d.domain);
  const allOrgDomains = [...new Set([...verifiedDomainNames, ...org.emailDomains])];

  return (
    <div className="pt-rise px-9 pb-[60px] pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto flex max-w-[920px] flex-col gap-[26px]">
        {/* En-tête */}
        <header className="flex flex-wrap items-start gap-4">
          <span
            className="grid h-12 w-12 flex-none place-items-center rounded-[13px] border text-[15px] font-bold"
            style={{
              background: "var(--acc-t)",
              borderColor: "var(--acc-b)",
              color: "var(--acc)",
            }}
          >
            {initialsFr(org.name)}
          </span>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <h1 className="pt-title text-[29px] leading-[1.1] tracking-[-0.02em]">{org.name}</h1>
            <p
              className="max-w-[64ch] text-[14.5px] leading-[1.6]"
              style={{ color: "var(--ink-2)", textWrap: "pretty" }}
            >
              Vous êtes administrateur de cette organisation. Ce que vous réglez ici s'applique{" "}
              {members.length === 1 ? "à la personne" : `aux ${numberFr(members.length)} personnes`}{" "}
              de {org.name} qui {members.length === 1 ? "utilise" : "utilisent"} le support{" "}
              {deFr(session.tenant.name)}.
            </p>
          </div>
        </header>

        {/* Onglets */}
        <nav className="flex flex-wrap gap-0.5 border-b" style={{ borderColor: "var(--line)" }}>
          {TABS.map(([key, label]) => {
            const active = tab === key;
            return (
              <Link
                key={key}
                href={`/help/organization${key === "sso" ? "" : `?tab=${key}`}`}
                className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-3 text-[15px] transition-colors duration-150 hover:no-underline ${active ? "font-semibold" : "font-[450]"}`}
                style={{
                  color: active ? "var(--ink)" : "var(--ink-3)",
                  borderColor: active ? "var(--acc)" : "transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {tab === "sso" && (
          <SsoSection
            tenantSlug={session.tenant.slug}
            orgId={org.id}
            orgName={org.name}
            strictDomain={verifiedDomainNames[0] ?? org.emailDomains[0] ?? null}
            conn={conn}
            provider={provider}
          />
        )}
        {tab === "domains" && (
          <DomainsSection domains={domains} members={members} error={error} domainValue={domain} />
        )}
        {tab === "members" && (
          <MembersSection
            members={members}
            orgDomains={allOrgDomains}
            sharedTickets={org.sharedTickets}
            ssoActive={conn?.status === "active"}
            ssoProviderLabel={providerName}
          />
        )}
      </div>
    </div>
  );
}
