import type { OrgMemberRow } from "@/lib/portal-data";
import { displayNameFr, initialsFr, numberFr } from "../../portal-format";
import { toggleOrgSharing } from "./actions";

const AVATARS = [
  { background: "var(--acc-t)", color: "var(--acc)" },
  { background: "var(--open-t)", color: "var(--open)" },
  { background: "var(--wait-t)", color: "var(--wait)" },
];

const GRID = "minmax(190px,1.3fr) 150px 130px 110px";

/** PT-08 · onglet Collaborateurs — partage des demandes + table réelle. */
export function MembersSection({
  members,
  orgDomains,
  sharedTickets,
  ssoActive,
  ssoProviderLabel,
}: {
  members: OrgMemberRow[];
  orgDomains: string[];
  sharedTickets: boolean;
  ssoActive: boolean;
  ssoProviderLabel: string | null;
}) {
  const domainSet = new Set(orgDomains.map((d) => d.toLowerCase()));
  const inOrgDomain = (email: string) => domainSet.has(email.split("@")[1]?.toLowerCase() ?? "");

  return (
    <div className="flex flex-col gap-5">
      {/* Partage des demandes (organizations.sharedTickets) */}
      <div
        className="flex items-start gap-3.5 rounded-[14px] border px-[18px] py-4"
        style={{
          background: "var(--panel)",
          borderColor: "var(--line)",
          boxShadow: "var(--sh-1)",
        }}
      >
        <form action={toggleOrgSharing} className="flex-none">
          <button
            type="submit"
            className="pt-switch mt-px"
            data-on={sharedTickets ? "true" : "false"}
            aria-label="Demandes visibles par toute l'organisation"
          />
        </form>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">Demandes visibles par toute l'organisation</p>
          <p
            className="text-[13.5px] leading-[1.55]"
            style={{ color: "var(--ink-3)", textWrap: "pretty" }}
          >
            Chaque collaborateur voit les demandes de ses collègues, pas seulement les siennes.
          </p>
        </div>
      </div>

      {/* Table Collaborateur / Rôle / Connexion / Demandes */}
      <div
        className="overflow-x-auto rounded-[14px] border"
        style={{
          background: "var(--panel)",
          borderColor: "var(--line)",
          boxShadow: "var(--sh-1)",
        }}
      >
        <div
          className="grid h-[42px] min-w-[640px] items-center border-b px-[18px] text-[11.5px] font-semibold uppercase tracking-[0.09em]"
          style={{
            gridTemplateColumns: GRID,
            background: "var(--canvas)",
            borderColor: "var(--line)",
            color: "var(--ink-3)",
          }}
        >
          <div>Collaborateur</div>
          <div>Rôle</div>
          <div>Connexion</div>
          <div className="text-right">Demandes</div>
        </div>
        {members.map((m, i) => {
          const role = m.isAdmin
            ? "Administrateur"
            : inOrgDomain(m.email)
              ? "Collaborateur"
              : "Invité";
          const viaSso = Boolean(ssoActive && ssoProviderLabel && inOrgDomain(m.email));
          const connection = viaSso ? ssoProviderLabel! : "Lien email";
          return (
            <div
              key={m.id}
              className="grid min-h-[56px] min-w-[640px] items-center border-b px-[18px] text-sm"
              style={{ gridTemplateColumns: GRID, borderColor: "var(--line-2)" }}
            >
              <div className="flex min-w-0 items-center gap-[11px] pr-2.5">
                <span
                  className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-[10.5px] font-bold"
                  style={AVATARS[i % AVATARS.length]}
                >
                  {initialsFr(m.name ?? m.email)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{displayNameFr(m.name, m.email)}</span>
                  <span className="block truncate text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    {m.email}
                  </span>
                </span>
              </div>
              <div>
                <span
                  className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold"
                  style={
                    m.isAdmin
                      ? { background: "var(--acc-t)", color: "var(--acc)" }
                      : { background: "var(--closed-t)", color: "var(--closed)" }
                  }
                >
                  {role}
                </span>
              </div>
              {/* Maquette : ink-2 quand la connexion passe par le SSO, ink-3 sinon. */}
              <div className="text-[13px]" style={{ color: viaSso ? "var(--ink-2)" : "var(--ink-3)" }}>
                {connection}
              </div>
              <div className="text-right tabular-nums" style={{ color: "var(--ink-2)" }}>
                {numberFr(m.requestCount)}
              </div>
            </div>
          );
        })}
      </div>

      <p
        className="max-w-[70ch] text-[13.5px] leading-[1.6]"
        style={{ color: "var(--ink-3)", textWrap: "pretty" }}
      >
        Les collaborateurs apparaissent automatiquement à leur première connexion ou à leur
        première demande. Vous pouvez désigner un second administrateur pour ne pas rester seul
        point de contact.
      </p>
    </div>
  );
}
