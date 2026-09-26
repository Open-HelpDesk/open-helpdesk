"use client";

import { useT } from "@/i18n/client";
import { ConfigSeg, Row, useCfg } from "./primitives";

/** Account removal at the identity provider — the delay only matters for "disable then delete". */
export function DeprovisionRows() {
  const t = useT();
  const { config } = useCfg();
  const delayApplies = config.directory.deprovision === "disable_then_delete";
  return (
    <>
      <Row label={t("desk.cfg.dir.deprovAccount")} hint={t("desk.cfg.dir.deprovAccountHint")}>
        <ConfigSeg
          section="directory"
          field="deprovision"
          label={t("desk.cfg.dir.deprovAccount")}
          options={[
            { value: "disable_then_delete", label: t("desk.cfg.dir.deprov.disableThenDelete") },
            { value: "disable", label: t("desk.cfg.dir.deprov.disable") },
            { value: "delete", label: t("desk.cfg.dir.deprov.delete") },
          ]}
        />
      </Row>
      <Row label={t("desk.cfg.dir.deleteAfter")} hint={t("desk.cfg.dir.deleteAfterHint")} disabled={!delayApplies} last>
        <ConfigSeg
          section="directory"
          field="deleteAfterDays"
          label={t("desk.cfg.dir.deleteAfter")}
          disabled={!delayApplies}
          options={[
            { value: 30, label: t("desk.cfg.days", { count: 30 }) },
            { value: 90, label: t("desk.cfg.days", { count: 90 }) },
          ]}
        />
      </Row>
    </>
  );
}
