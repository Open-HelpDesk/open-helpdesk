"use client";

import { useT } from "@/i18n/client";
import type { CatalogueCounts } from "@/lib/desk/config-data";
import { ConfigSeg, Panel, Row, useCfg } from "@/components/desk/config/primitives";

const MONTHS = { quarterly: 3, half_yearly: 6, yearly: 12 } as const;

export function ReviewsRows({ counts, last }: { counts: CatalogueCounts; last: { name: string; opensOn: string } | null }) {
  const t = useT();
  const { config } = useCfg();
  const r = config.reviews;

  let next: string;
  if (!last) next = t("desk.cfg.rev.nextNone");
  else {
    const d = new Date(`${last.opensOn}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + MONTHS[r.frequency]);
    next = t("desk.cfg.rev.next", { date: t.fmt.dateLong(d), last: t.fmt.dateLong(new Date(`${last.opensOn}T12:00:00Z`)) });
  }
  const scopeNote =
    r.scope === "all"
      ? t("desk.cfg.rev.scope.allNote", { count: counts.apps })
      : r.scope === "sensitive"
        ? t("desk.cfg.rev.scope.sensitiveNote", { count: counts.sensitive })
        : t("desk.cfg.rev.scope.privilegedNote", { count: counts.privilegedTiers });

  return (
    <Panel title={t("desk.cfg.rev.title")} hint={next}>
      <Row label={t("desk.cfg.rev.frequency")} hint={t("desk.cfg.rev.frequencyHint")}>
        <ConfigSeg
          section="reviews"
          field="frequency"
          label={t("desk.cfg.rev.frequency")}
          options={[
            { value: "quarterly", label: t("desk.cfg.rev.freq.quarterly") },
            { value: "half_yearly", label: t("desk.cfg.rev.freq.halfYearly") },
            { value: "yearly", label: t("desk.cfg.rev.freq.yearly") },
          ]}
        />
      </Row>
      <Row label={t("desk.cfg.rev.scope")} hint={scopeNote}>
        <ConfigSeg
          section="reviews"
          field="scope"
          label={t("desk.cfg.rev.scope")}
          options={[
            { value: "all", label: t("desk.cfg.rev.scope.all") },
            { value: "sensitive", label: t("desk.cfg.rev.scope.sensitive") },
            { value: "privileged", label: t("desk.cfg.rev.scope.privileged") },
          ]}
        />
      </Row>
      <Row label={t("desk.cfg.rev.reviewers")}>
        <ConfigSeg
          section="reviews"
          field="reviewers"
          label={t("desk.cfg.rev.reviewers")}
          options={[
            { value: "managers", label: t("desk.cfg.rev.reviewers.managers") },
            { value: "owners", label: t("desk.cfg.rev.reviewers.owners") },
            { value: "both", label: t("desk.cfg.rev.reviewers.both") },
          ]}
        />
      </Row>
      <Row label={t("desk.cfg.rev.unanswered")} hint={t("desk.cfg.rev.unansweredHint")} last>
        <ConfigSeg
          section="reviews"
          field="whenUnanswered"
          label={t("desk.cfg.rev.unanswered")}
          options={[
            { value: "escalate", label: t("desk.cfg.rev.unanswered.escalate") },
            { value: "revoke", label: t("desk.cfg.rev.unanswered.revoke") },
          ]}
        />
      </Row>
    </Panel>
  );
}
