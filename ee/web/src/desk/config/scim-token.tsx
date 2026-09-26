"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { Btn, Row, useCfg } from "@/components/desk/config/primitives";
import { mono } from "@/components/desk/config/styles";
import { rotateScimTokenAction } from "./actions";

export function ScimTokenRows({ endpoint, suffix, createdAt }: { endpoint: string; suffix: string | null; createdAt: string | null }) {
  const t = useT();
  const { toast, track } = useCfg();
  const [current, setCurrent] = useState({ suffix, createdAt });
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t("desk.cfg.copied"));
    } catch {
      /* clipboard refused (http, permissions): the value stays selectable on screen */
    }
  };

  const rotate = async () => {
    if (current.suffix && !window.confirm(t("desk.cfg.scim.rotateConfirm"))) return;
    setBusy(true);
    try {
      const res = await track(rotateScimTokenAction());
      if (res.ok) {
        setFresh(res.value.token);
        setCurrent({ suffix: res.value.suffix, createdAt: new Date().toISOString() });
        toast(t("desk.cfg.scim.rotated"));
      } else {
        toast(res.error, "dang");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Row label={t("desk.cfg.scim.endpoint")} hint={t("desk.cfg.scim.endpointHint")}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ ...mono, padding: "6px 10px", borderRadius: 8, background: "var(--sunk)", userSelect: "all" }}>{endpoint}</code>
          <Btn onClick={() => copy(endpoint)}>{t("desk.cfg.copy")}</Btn>
        </div>
      </Row>
      <Row
        label={t("desk.cfg.scim.token")}
        hint={
          current.suffix
            ? t("desk.cfg.scim.tokenHint", { suffix: current.suffix, date: current.createdAt ? t.fmt.dateLong(new Date(current.createdAt)) : "—" })
            : t("desk.cfg.scim.noToken")
        }
        last={!fresh}
      >
        <Btn onClick={rotate} disabled={busy}>
          {current.suffix ? t("desk.cfg.scim.rotate") : t("desk.cfg.scim.generate")}
        </Btn>
      </Row>
      {fresh && (
        <div style={{ padding: "12px 18px", background: "var(--wait-t)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--wait)" }}>{t("desk.cfg.scim.showOnce")}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ ...mono, padding: "6px 10px", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--line)", userSelect: "all", wordBreak: "break-all" }}>{fresh}</code>
            <Btn onClick={() => copy(fresh)}>{t("desk.cfg.copy")}</Btn>
            <Btn onClick={() => setFresh(null)}>{t("desk.cfg.scim.done")}</Btn>
          </div>
        </div>
      )}
    </>
  );
}
