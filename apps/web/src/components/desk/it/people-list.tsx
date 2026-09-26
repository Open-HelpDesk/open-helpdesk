"use client";

/**
 * SD-A5 — the directory column: search, departures flagged, CSV import and
 * manual entry. The profile itself is rendered by the server (people-screen).
 */
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { PersonRow } from "@/lib/desk/it-data";
import { addPersonAction, importPeopleAction } from "@/app/app/desk/people/actions";
import { CsvImportDialog } from "./csv-import";
import { Avatar, btnStyle, dateOnly, Field, inputStyle, Overlay, useToast } from "./ui";

const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase();

export function PeopleList({ people, selectedId }: { people: PersonRow[]; selectedId: string | null }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<"none" | "import" | "add">("none");
  const shown = useMemo(() => {
    const f = fold(q.trim());
    if (!f) return people;
    return people.filter((p) => fold(`${p.name} ${p.email} ${p.title ?? ""} ${p.department ?? ""}`).includes(f));
  }, [people, q]);

  return (
    <div className="flex min-h-0 shrink-0 flex-col border-r" style={{ width: 240, borderColor: "var(--line)", background: "var(--panel)" }}>
      <div className="flex flex-col" style={{ padding: "16px 16px 10px", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--font-title)", fontSize: 19, fontWeight: 600, letterSpacing: "-.015em" }}>{t("desk.it.people.title")}</h1>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("desk.it.people.search")} aria-label={t("desk.it.people.search")} style={{ ...inputStyle, height: 32, fontSize: 12.5 }} />
        <div className="flex" style={{ gap: 6 }}>
          <button type="button" className="ohd-hover-edge-ink" style={{ ...btnStyle("ghost"), height: 30, padding: "0 10px", fontSize: 12, flex: 1 }} onClick={() => setDialog("import")}>
            {t("desk.it.people.import")}
          </button>
          <button type="button" className="ohd-hover-edge-ink" style={{ ...btnStyle("ghost"), height: 30, padding: "0 10px", fontSize: 12, flex: 1 }} onClick={() => setDialog("add")}>
            {t("desk.it.people.add")}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {people.length === 0 && <p style={{ padding: "8px 16px", fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.it.people.empty")}</p>}
        {people.length > 0 && shown.length === 0 && <p style={{ padding: "8px 16px", fontSize: 12.5, color: "var(--ink-3)" }}>{t("desk.it.people.noMatch")}</p>}
        {shown.map((p) => {
          const on = p.id === selectedId;
          const leaving = p.leavesOn && p.status !== "departed" ? t("desk.it.people.leaving", { date: t.fmt.dateShort(dateOnly(p.leavesOn)) }) : null;
          return (
            <Link
              key={p.id}
              href={`/app/desk/people/${p.id}`}
              aria-current={on ? "true" : undefined}
              className="ohd-row flex items-center"
              style={{ gap: 10, padding: "10px 16px", "--row-bg": on ? "var(--brand-t)" : "transparent", opacity: p.status === "departed" ? 0.55 : 1 } as CSSProperties}
            >
              <Avatar name={p.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{p.name}</span>
                <span className="block truncate" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {[p.title, p.department].filter(Boolean).join(" · ") || p.email}
                </span>
              </span>
              {leaving && <span title={leaving} aria-label={leaving} style={{ width: 8, height: 8, borderRadius: 99, background: "var(--dang)", flex: "none" }} />}
            </Link>
          );
        })}
      </div>

      <CsvImportDialog
        open={dialog === "import"}
        onClose={() => setDialog("none")}
        title={t("desk.it.import.peopleTitle")}
        hint={t("desk.it.import.peopleHint")}
        run={importPeopleAction}
      />
      <AddPersonDialog open={dialog === "add"} onClose={() => setDialog("none")} />
    </div>
  );
}

function AddPersonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const empty = { email: "", name: "", title: "", department: "", managerEmail: "", startsOn: "", leavesOn: "" };
  const [f, setF] = useState(empty);
  const bind = (k: keyof typeof empty) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }), style: inputStyle });

  return (
    <Overlay open={open} onClose={onClose} title={t("desk.it.people.addTitle")} variant="drawer">
      <form
        className="flex flex-col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await addPersonAction(f);
            if (res.ok) {
              toast(t("desk.it.people.added", { name: f.name.trim() }));
              setF(empty);
              onClose();
              router.push(`/app/desk/people/${res.value}`);
              router.refresh();
            } else toast(t("desk.it.common.error", { message: res.error }), "error");
          });
        }}
      >
        <Field label={t("desk.it.people.fieldName")}>
          <input required autoFocus {...bind("name")} />
        </Field>
        <Field label={t("desk.it.people.fieldEmail")}>
          <input required type="email" {...bind("email")} />
        </Field>
        <Field label={t("desk.it.people.fieldTitle")}>
          <input {...bind("title")} />
        </Field>
        <Field label={t("desk.it.people.fieldDepartment")}>
          <input {...bind("department")} />
        </Field>
        <Field label={t("desk.it.people.fieldManagerEmail")}>
          <input type="email" {...bind("managerEmail")} />
        </Field>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("desk.it.people.fieldStartsOn")}>
            <input type="date" {...bind("startsOn")} />
          </Field>
          <Field label={t("desk.it.people.fieldLeavesOn")}>
            <input type="date" {...bind("leavesOn")} />
          </Field>
        </div>
        <div className="flex justify-end" style={{ gap: 8 }}>
          <button type="button" className="ohd-hover" style={btnStyle("ghost")} onClick={onClose}>
            {t("desk.it.common.cancel")}
          </button>
          <button type="submit" disabled={pending} style={btnStyle("primary")}>
            {t("desk.it.common.save")}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
