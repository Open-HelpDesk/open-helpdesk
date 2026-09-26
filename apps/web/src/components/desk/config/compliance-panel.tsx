"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";
import { revealSiemSecret, sendSiemTestEvent } from "@/app/app/desk/config/actions";
import { Btn, ConfigSeg, ConfigSwitch, Panel, Row, useCfg } from "./primitives";
import { inputCss, mono } from "./styles";

const FRAMEWORKS: Array<[MessageKey, MessageKey]> = [
  ["desk.cfg.audit.fw.isoName", "desk.cfg.audit.fw.iso"],
  ["desk.cfg.audit.fw.nis2Name", "desk.cfg.audit.fw.nis2"],
  ["desk.cfg.audit.fw.doraName", "desk.cfg.audit.fw.dora"],
  ["desk.cfg.audit.fw.gdprName", "desk.cfg.audit.fw.gdpr"],
];

export function CompliancePanel({ reviewsEnabled }: { reviewsEnabled: boolean }) {
  const t = useT();
  const { config, update, toast, track } = useCfg();
  const [url, setUrl] = useState(config.compliance.siemWebhookUrl ?? "");
  const [secret, setSecret] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const commitUrl = () => {
    const next = url.trim() || null;
    if (next === config.compliance.siemWebhookUrl) return;
    if (next && !/^https?:\/\/\S+$/i.test(next)) return toast(t("desk.cfg.siemBadUrl"), "dang");
    update("compliance", "siemWebhookUrl", next);
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await track(sendSiemTestEvent());
      if (res.ok) toast(t("desk.cfg.audit.testOk", { status: String(res.status), ms: res.ms }));
      else toast(res.error ?? t("desk.cfg.siemUnreachable"), "dang");
    } finally {
      setTesting(false);
    }
  };

  const reveal = async () => {
    if (secret) return setSecret(null);
    setSecret(await revealSiemSecret());
  };

  const saved = config.compliance.siemWebhookUrl;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title={t("desk.cfg.audit.journalTitle")} hint={t("desk.cfg.audit.journalHint")}>
        <Row label={t("desk.cfg.audit.retention")} hint={t("desk.cfg.audit.retentionHint")}>
          <ConfigSeg
            section="compliance"
            field="retentionYears"
            label={t("desk.cfg.audit.retention")}
            options={[1, 5, 10].map((y) => ({ value: y as 1 | 5 | 10, label: t("desk.cfg.years", { count: y }) }))}
          />
        </Row>
        <Row
          label={t("desk.cfg.audit.evidence")}
          hint={reviewsEnabled ? t("desk.cfg.audit.evidenceHint") : t("desk.cfg.audit.evidenceLocked")}
          disabled
        >
          {/* Nothing generates the PDF at closing yet (closeAccessReview ignores the
              setting): a live switch would promise evidence nobody produces. */}
          <ConfigSwitch section="compliance" field="autoEvidence" label={t("desk.cfg.audit.evidence")} disabled />
        </Row>
        <Row label={t("desk.cfg.audit.siem")} hint={t("desk.cfg.audit.siemHint")} last={!saved}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="url"
              value={url}
              aria-label={t("desk.cfg.audit.siemUrl")}
              placeholder="https://siem.example.com/hooks/openhelpdesk"
              onChange={(e) => setUrl(e.target.value)}
              onBlur={commitUrl}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              style={{ ...inputCss, ...mono, fontSize: 12.5, width: 300, maxWidth: "100%" }}
            />
            <Btn onClick={test} disabled={!saved || testing} title={saved ? undefined : t("desk.cfg.siemNoUrl")}>
              {t("desk.cfg.audit.test")}
            </Btn>
          </div>
        </Row>
        {saved && (
          <Row label={t("desk.cfg.audit.secret")} hint={t("desk.cfg.audit.secretHint")} last>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {secret && <code style={{ ...mono, padding: "6px 10px", borderRadius: 8, background: "var(--sunk)", userSelect: "all", wordBreak: "break-all", maxWidth: 360 }}>{secret}</code>}
              <Btn onClick={reveal}>{secret ? t("desk.cfg.audit.hideSecret") : t("desk.cfg.audit.showSecret")}</Btn>
            </div>
          </Row>
        )}
      </Panel>

      <Panel title={t("desk.cfg.audit.fwTitle")}>
        {FRAMEWORKS.map(([name, key], i) => (
          <div key={name} style={{ display: "flex", gap: 12, padding: "11px 18px", borderBottom: i === FRAMEWORKS.length - 1 ? "none" : "1px solid var(--line-2)", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 220 }}>{t(name)}</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t(key)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}
