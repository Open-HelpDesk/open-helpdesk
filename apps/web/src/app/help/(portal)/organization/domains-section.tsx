import { DOMAIN_VERIFICATION_TXT_PREFIX } from "@openhelpdesk/config";
import type { OrgMemberRow } from "@/lib/portal-data";
import { pluralFr, relativeLongFr } from "../../portal-format";
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

const ADD_ERRORS: Record<string, string> = {
  invalid: "Format de domaine invalide — exemple attendu : entreprise.fr.",
  public: "Les domaines d'email grand public ne peuvent pas être vérifiés.",
  exists: "Ce domaine est déjà déclaré sur cet espace.",
};

/** PT-08 · onglet Domaines — vérification DNS TXT fonctionnelle. */
export function DomainsSection({
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
  const countFor = (domain: string) =>
    members.filter((m) => m.email.toLowerCase().endsWith(`@${domain}`)).length;

  return (
    <div className="flex flex-col gap-5">
      <p
        className="max-w-[68ch] text-[14.5px]"
        style={{ color: "var(--ink-2)", textWrap: "pretty" }}
      >
        Un domaine doit être vérifié avant de pouvoir porter une connexion SSO. Cette vérification
        garantit que personne d'autre ne peut revendiquer les comptes de vos collaborateurs.
      </p>

      <div className="flex flex-col gap-3">
        {domains.map((d) => {
          const verified = d.status === "verified";
          const record = `${DOMAIN_VERIFICATION_TXT_PREFIX}${d.verificationToken}`;
          return (
            <div
              key={d.id}
              className="overflow-hidden rounded-[11px] border"
              style={{
                background: "var(--panel)",
                borderColor: verified ? "var(--line)" : "var(--wait)",
              }}
            >
              <div
                className="flex flex-wrap items-center gap-3 px-4 py-3.5"
                style={{ background: verified ? "transparent" : "var(--wait-t)" }}
              >
                <span
                  className="h-[9px] w-[9px] flex-none rounded-full"
                  style={{ background: verified ? "var(--ok)" : "var(--wait)" }}
                />
                <span className="min-w-[140px] flex-1 font-mono text-[15px] font-semibold">
                  {d.domain}
                </span>
                <span
                  className="whitespace-nowrap rounded-[20px] px-2.5 py-0.5 text-[12.5px] font-semibold"
                  style={
                    verified
                      ? { background: "var(--ok-t)", color: "var(--ok)" }
                      : { background: "var(--wait-t)", color: "var(--wait)" }
                  }
                >
                  {verified ? "Vérifié" : "À vérifier"}
                </span>
                <span className="whitespace-nowrap text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {pluralFr(countFor(d.domain), "collaborateur")}
                </span>
              </div>
              {!verified && (
                <div
                  className="flex flex-col gap-[11px] border-t px-4 py-3.5"
                  style={{ borderColor: "var(--line-2)" }}
                >
                  <p className="text-[13.5px]" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
                    Ajoutez cet enregistrement TXT à la zone DNS de{" "}
                    <span className="font-mono">{d.domain}</span>, puis lancez la vérification.
                  </p>
                  <div
                    className="break-all rounded-[9px] border px-[15px] py-[13px] font-mono text-[13px]"
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
                      Enregistrement introuvable lors de la dernière vérification (
                      {relativeLongFr(d.lastCheckedAt)}).
                    </p>
                  )}
                  <div className="flex flex-wrap gap-[9px]">
                    <form action={verifyOrgDomain}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className="grid min-h-10 place-items-center whitespace-nowrap rounded-lg px-4 py-[9px] text-sm font-semibold text-white"
                        style={{ background: "var(--acc)" }}
                      >
                        Vérifier maintenant
                      </button>
                    </form>
                    <CopyButton
                      text={record}
                      label="Copier l'enregistrement"
                      className="grid min-h-10 place-items-center whitespace-nowrap rounded-lg border px-4 py-[9px] text-sm"
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
          className="pt-acc rounded-[11px] border border-dashed"
          style={{ borderColor: "var(--line)" }}
          open={Boolean(error)}
        >
          <summary
            className="rounded-[11px] px-4 py-3.5 text-center text-sm"
            style={{ color: "var(--ink-3)" }}
          >
            + Ajouter un domaine
          </summary>
          <form action={addOrgDomain} className="flex flex-col gap-2.5 px-4 pb-4">
            {error && ADD_ERRORS[error] && (
              <p className="text-[13.5px]" style={{ color: "var(--dang)" }}>
                {ADD_ERRORS[error]}
              </p>
            )}
            <div className="flex flex-wrap gap-[9px]">
              <input
                name="domain"
                required
                defaultValue={domainValue ?? ""}
                placeholder="entreprise.fr"
                className="pt-input h-[42px] min-w-[220px] flex-1 px-[13px] font-mono text-sm"
              />
              <button
                type="submit"
                className="grid h-[42px] place-items-center rounded-lg px-4 text-sm font-semibold text-white"
                style={{ background: "var(--acc)" }}
              >
                Ajouter
              </button>
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}
