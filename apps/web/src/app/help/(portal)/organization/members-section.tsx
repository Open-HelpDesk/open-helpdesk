import type { OrgMemberRow } from "@/lib/portal-data";
import { displayName, initials } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { toggleOrgSharing } from "./actions";

const AVATARS = [
  { background: "var(--acc-t)", color: "var(--acc)" },
  { background: "var(--open-t)", color: "var(--open)" },
  { background: "var(--wait-t)", color: "var(--wait)" },
];

const GRID = "minmax(190px,1.3fr) 150px 130px 110px";

/** PT-08 · Members tab — request sharing + real table. */
export async function MembersSection({
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
  const t = await getT();
  const domainSet = new Set(orgDomains.map((d) => d.toLowerCase()));
  const inOrgDomain = (email: string) => domainSet.has(email.split("@")[1]?.toLowerCase() ?? "");

  return (
    <div className="flex flex-col gap-5">
      {/* Request sharing (organizations.sharedTickets) */}
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
            aria-label={t("members.shareTitle")}
          />
        </form>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">{t("members.shareTitle")}</p>
          <p
            className="text-[13.5px] leading-[1.55]"
            style={{ color: "var(--ink-3)", textWrap: "pretty" }}
          >
            {t("members.shareDesc")}
          </p>
        </div>
      </div>

      {/* Member / Role / Sign-in / Requests table */}
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
          <div>{t("members.colMember")}</div>
          <div>{t("members.colRole")}</div>
          <div>{t("members.colAuth")}</div>
          <div className="text-right">{t("members.colRequests")}</div>
        </div>
        {members.map((m, i) => {
          const role = m.isAdmin
            ? t("members.roleAdmin")
            : inOrgDomain(m.email)
              ? t("members.roleMember")
              : t("members.roleGuest");
          const viaSso = Boolean(ssoActive && ssoProviderLabel && inOrgDomain(m.email));
          const connection = viaSso ? ssoProviderLabel! : t("members.authEmailLink");
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
                  {initials(m.name ?? m.email)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{displayName(m.name, m.email)}</span>
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
              {/* Mockup: ink-2 when the sign-in goes through SSO, ink-3 otherwise. */}
              <div className="text-[13px]" style={{ color: viaSso ? "var(--ink-2)" : "var(--ink-3)" }}>
                {connection}
              </div>
              <div className="text-right tabular-nums" style={{ color: "var(--ink-2)" }}>
                {t.fmt.number(m.requestCount)}
              </div>
            </div>
          );
        })}
      </div>

      <p
        className="max-w-[70ch] text-[13.5px] leading-[1.6]"
        style={{ color: "var(--ink-3)", textWrap: "pretty" }}
      >
        {t("members.note")}
      </p>
    </div>
  );
}
