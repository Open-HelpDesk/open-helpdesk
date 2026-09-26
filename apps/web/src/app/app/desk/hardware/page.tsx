import { requireAgent } from "@/lib/session";
import { entitlementsFor } from "@/lib/entitlements";
import { hardwareInventory, peopleOptions } from "@/lib/desk/it-data";
import { HardwareScreen } from "@/components/desk/it/hardware-screen";
import { getT } from "@/i18n/server";

/** SD-A7 — the hardware inventory. A workspace without the module sees why, not a 404. */
export default async function DeskHardwarePage() {
  const { tenant } = await requireAgent();
  if (!entitlementsFor(tenant).deskHardware) {
    const t = await getT();
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center" style={{ maxWidth: 420, padding: "26px 28px", borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)" }}>
          <h1 style={{ fontFamily: "var(--font-title)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{t("desk.it.hw.lockedTitle")}</h1>
          <p className="mt-2" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {t("desk.it.hw.lockedText")}
          </p>
        </div>
      </div>
    );
  }
  const [rows, people] = await Promise.all([hardwareInventory(tenant.id), peopleOptions(tenant.id)]);
  // "Expired" is decided against the server's today, so the red never depends on the viewer's clock.
  const today = new Date().toISOString().slice(0, 10);
  return <HardwareScreen rows={rows} people={people} today={today} />;
}
