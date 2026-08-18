import { DOMAIN_VERIFICATION_TXT_PREFIX } from "@openhelpdesk/config";
import type { OrgMemberRow } from "@/lib/portal-data";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/dictionaries/fr";
import { addOrgDomain, verifyOrgDomain } from "./actions";
import { CopyButton } from "./copy-button";

type DomainRow = {
  id: string;
  domain: string;
  status: "pending" | "verified" | "failed";
  verificationToken: string;
  failCount: number;
  lastCheckedAt: Date | null;
};

const ADD_ERRORS: Record<string, MessageKey> = {
  invalid: "domains.errorInvalid",
  public: "domains.errorPublic",
  exists: "domains.errorExists",
};

/** PT-08 · onglet Domaines — vérification DNS TXT fonctionnelle. */
export async function DomainsSection({
  domains,
  members,
  error,
  domainValue,
}: {
  domains: DomainRow[];
  members: OrgMemberRow[];
  error?: string;
  domainValue?: string;
}) {
  const t = await getT();
  const countFor = (domain: string) =>
    members.filter((m) => m.email.toLowerCase().endsWith(`@${domain}`)).length;

  return (
    <div className="flex flex-col gap-[22px]">
      <p
        className="max-w-[66ch] text-[14.5px] leading-[1.65]"
        style={{ color: "var(--ink-2)", textWrap: "pretty" }}
      >
        {t("domains.intro")}
      </p>

      <div className="flex flex-col gap-3">
        {domains.map((d) => {
          const verified = d.status === "verified";
          const record = `${DOMAIN_VERIFICATION_TXT_PREFIX}${d.verificationToken}`;
          const [txtBefore, txtAfter] = t.parts("domains.txtInstructions", "domain");
          return (
            <div
              key={d.id}
              className="overflow-hidden rounded-[14px] border"
              style={{
                background: "var(--panel)",
                borderColor: verified ? "var(--line)" : "var(--wait)",
                boxShadow: "var(--sh-1)",
              }}
            >
              <div
                className="flex flex-wrap items-center gap-[13px] px-[18px] py-4"
                style={{ background: verified ? "transparent" : "var(--wait-t)" }}
              >
                <span
                  className="h-[9px] w-[9px] flex-none rounded-full"
                  style={{ background: verified ? "var(--ok)" : "var(--wait)" }}
                />
                <span className="min-w-[140px] flex-1 font-mono text-[15px] font-medium">
                  {d.domain}
                </span>
                <span
                  className="whitespace-nowrap rounded-full px-[11px] py-[3px] text-[12.5px] font-semibold"
                  style={
                    verified
                      ? { background: "var(--ok-t)", color: "var(--ok)" }
                      : { background: "var(--wait-t)", color: "var(--wait)" }
                  }
                >
                  {verified ? t("domains.verified") : t("domains.pending")}
                </span>
                <span className="whitespace-nowrap text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {t("domains.memberCount", { count: countFor(d.domain) })}
                </span>
              </div>
              {!verified && (
                <div
                  className="flex flex-col gap-3 border-t px-[18px] py-4"
                  style={{ borderColor: "var(--line-2)" }}
                >
                  <p
                    className="text-[13.5px] leading-[1.55]"
                    style={{ color: "var(--ink-2)", textWrap: "pretty" }}
                  >
                    {/* Le domaine est en chasse fixe : la phrase est découpée
                        autour de lui pour ne pas figer l'ordre des mots. */}
                    {txtBefore}
                    <span className="font-mono">{d.domain}</span>
                    {txtAfter}
                  </p>
                  <div
                    className="break-all rounded-[11px] border px-4 py-3.5 font-mono text-[13px]"
                    style={{
                      background: "var(--sunk)",
                      borderColor: "var(--line)",
                      color: "var(--ink-2)",
                    }}
                  >
                    {record}
                  </div>
                  {d.failCount > 0 && d.lastCheckedAt && (
                    <p className="text-[13px]" style={{ color: "var(--dang)" }}>
                      {t("domains.notFound", { when: t.fmt.relative(d.lastCheckedAt) })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2.5">
                    <form action={verifyOrgDomain}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className="grid min-h-[42px] place-items-center whitespace-nowrap rounded-[9px] px-[18px] py-2.5 text-sm font-semibold text-white"
                        style={{ background: "var(--cta-a)" }}
                      >
                        {t("domains.verifyNow")}
                      </button>
                    </form>
                    <CopyButton
                      text={record}
                      label={t("domains.copyRecord")}
                      className="grid min-h-[42px] place-items-center whitespace-nowrap rounded-[9px] border px-[18px] py-2.5 text-sm"
                      style={{
                        borderColor: "var(--line)",
                        background: "var(--panel)",
                        color: "var(--ink)",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* + Ajouter un domaine */}
        <details
          className="pt-acc pt-dashed rounded-[14px]"
          open={Boolean(error)}
        >
          <summary
            className="rounded-[14px] px-[18px] py-4 text-center text-sm"
            style={{ color: "var(--ink-3)" }}
          >
            {t("domains.add")}
          </summary>
          <form action={addOrgDomain} className="flex flex-col gap-2.5 px-4 pb-4">
            {error && ADD_ERRORS[error] && (
              <p className="text-[13.5px]" style={{ color: "var(--dang)" }}>
                {t(ADD_ERRORS[error]!)}
              </p>
            )}
            <div className="flex flex-wrap gap-[9px]">
              <input
                name="domain"
                required
                defaultValue={domainValue ?? ""}
                placeholder="example.com"
                className="pt-input h-[42px] min-w-[220px] flex-1 px-3.5 font-mono text-sm"
              />
              <button
                type="submit"
                className="grid h-[42px] place-items-center rounded-[9px] px-[18px] text-sm font-semibold text-white"
                style={{ background: "var(--cta-a)" }}
              >
                {t("domains.addSubmit")}
              </button>
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}
