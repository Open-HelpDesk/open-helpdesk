import { requireAgent } from "@/lib/session";
import { db, users } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { relativeFr } from "@/lib/format";
import { Avatar } from "@/components/ticket-bits";
import { inviteAgent, toggleAgentActive, updateAgentRole } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  agent: "Agent",
  viewer: "Viewer",
};

/**
 * ST-02 — Agents, équipes & rôles (specs/11). Onglet Agents : table avec rôle
 * modifiable, invitations, désactivation (tickets repassés en non-assignés).
 * Reste à venir : onglet Équipes complet, renvoi d'invitation par email, quotas sièges.
 */
export default async function TeamPage() {
  const { tenant, agent: me } = await requireAgent();
  const agents = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, tenant.id))
    .orderBy(asc(users.name));

  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <div>
      <h1 className="text-lg font-semibold">Agents & équipes</h1>
      <p className="mb-5 mt-1 text-sm" style={{ color: "var(--mute)" }}>
        {activeCount} agent{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""} ·{" "}
        {agents.length} au total
      </p>

      {/* Invitation */}
      <form
        action={inviteAgent}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border p-4"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          EMAIL
          <input
            name="email"
            type="email"
            required
            placeholder="prenom.nom@entreprise.fr"
            className="w-56 rounded-md border px-2 py-1.5 text-sm font-normal"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          NOM
          <input
            name="name"
            required
            className="w-44 rounded-md border px-2 py-1.5 text-sm font-normal"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          RÔLE
          <select
            name="role"
            defaultValue="agent"
            className="rounded-md border px-2 py-1.5 text-sm font-normal"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
          >
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Inviter
        </button>
      </form>

      {/* Table des agents */}
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b text-left font-mono text-[11px] uppercase tracking-wider"
            style={{ borderColor: "var(--line)", color: "var(--mute)" }}
          >
            <th className="py-2 font-semibold">Agent</th>
            <th className="font-semibold">Rôle</th>
            <th className="font-semibold">Statut</th>
            <th className="font-semibold">Dernier accès</th>
            <th className="text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const isSelf = a.id === me.id;
            const canManage = !isSelf && (me.role === "owner" || a.role !== "owner");
            return (
              <tr key={a.id} className="border-b align-middle" style={{ borderColor: "var(--line)" }}>
                <td className="py-2.5">
                  <span className="flex items-center gap-2 font-medium">
                    <Avatar name={a.name} size={24} />
                    <span>
                      {a.name}
                      {isSelf && (
                        <span className="ml-1 text-xs" style={{ color: "var(--mute)" }}>
                          (vous)
                        </span>
                      )}
                      <span className="block text-xs font-normal" style={{ color: "var(--mute)" }}>
                        {a.email}
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  {canManage ? (
                    <form action={updateAgentRole} className="flex items-center gap-1">
                      <input type="hidden" name="userId" value={a.id} />
                      <select
                        name="role"
                        defaultValue={a.role}
                        className="rounded-md border px-1.5 py-1 text-xs"
                        style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                      >
                        {me.role === "owner" && <option value="owner">Owner</option>}
                        <option value="admin">Admin</option>
                        <option value="agent">Agent</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded border px-1.5 py-1 text-xs"
                        style={{ borderColor: "var(--line)" }}
                      >
                        OK
                      </button>
                    </form>
                  ) : (
                    ROLE_LABELS[a.role]
                  )}
                </td>
                <td>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={
                      a.status === "active"
                        ? { background: "var(--ok-t)", color: "var(--ok)" }
                        : a.status === "invited"
                          ? { background: "var(--wait-t)", color: "var(--wait)" }
                          : { background: "var(--closed-t)", color: "var(--closed)" }
                    }
                  >
                    {a.status === "active" ? "Actif" : a.status === "invited" ? "Invité" : "Désactivé"}
                  </span>
                </td>
                <td className="text-xs" style={{ color: "var(--mute)" }}>
                  {a.lastSeenAt ? relativeFr(a.lastSeenAt) : "—"}
                </td>
                <td className="text-right">
                  {canManage && (
                    <form action={toggleAgentActive} className="inline">
                      <input type="hidden" name="userId" value={a.id} />
                      <button
                        type="submit"
                        className="rounded-md border px-2 py-1 text-xs font-medium"
                        style={
                          a.status === "disabled"
                            ? { borderColor: "var(--line)" }
                            : { borderColor: "var(--dang)", color: "var(--dang)" }
                        }
                      >
                        {a.status === "disabled" ? "Réactiver" : "Désactiver"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs" style={{ color: "var(--mute)" }}>
        Désactiver un agent repasse ses tickets ouverts en non-assignés. L'envoi de
        l'email d'invitation arrive avec le canal email managé.
      </p>
    </div>
  );
}
